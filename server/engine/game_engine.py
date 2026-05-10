"""
GameEngine — owns one game's state and exposes a single ``handle_action``
entry point so transports (websocket today, anything tomorrow) stay thin.

The rule logic here is ported from
[Monkopoly-Single-Player/web/backend/game/engine.py] but reorganized into
methods so seat-aware authorization (``player_num``) lives in one place.
"""
from __future__ import annotations

import random

from .ai import (
    ai_property_buy_check,
    ai_trade_check,
    find_ai_trade_proposal,
    set_property_worth,
)
from .constants import (
    BABOON_BIN_SPACES,
    BOARD_SIZE,
    BUS_SPACES,
    COLOR_SETS,
    COMPANY_SPACES,
    PURCHASABLE_SPACES,
    TAX_SPACES,
)
from .models import GameState, PendingTrade, create_initial_state


class GameEngine:
    """Server-authoritative game state + rules. One instance per room."""

    def __init__(self, seat_is_human: tuple[bool, bool, bool, bool]) -> None:
        self.state: GameState = create_initial_state(seat_is_human=seat_is_human)
        self.num_humans = sum(1 for h in seat_is_human if h)
        self.num_ai = 4 - self.num_humans
        self._update_all_worth()

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    def to_dict(self) -> dict:
        return self.state.to_dict()

    def is_ai_turn(self) -> bool:
        return self.state.phase == "ai_turn" and not self.state.game_over

    def handle_action(self, player_num: int, action: dict) -> list[dict]:
        """
        Dispatch an action from ``player_num``. Returns a list of event dicts.
        Authorization is enforced here so cheating clients can't roll for
        someone else, etc.
        """
        kind = action.get("action")

        events: list[dict]
        if kind == "roll":
            blocked = self._pending_trade_blocks_turn_advance(player_num)
            if blocked is not None:
                return blocked
            events = self._guard_current(player_num, "waiting_for_roll", self._roll_dice)
        elif kind == "buy":
            events = self._guard_landed(player_num, "waiting_for_buy", self._buy_property_action)
        elif kind == "pass":
            events = self._guard_landed(player_num, "waiting_for_buy", self._pass_property)
        elif kind == "chest_ack":
            events = self._guard_chest_ack(player_num)
        elif kind == "end_turn":
            blocked = self._pending_trade_blocks_turn_advance(player_num)
            if blocked is not None:
                return blocked
            events = self._guard_current(player_num, "waiting_for_end_turn", self._end_turn)
        elif kind == "mortgage":
            events = self._mortgage_property(player_num, int(action.get("space", -1)))
        elif kind == "add_house":
            events = self._add_house(player_num, int(action.get("space", -1)))
        elif kind == "remove_house":
            events = self._remove_house(player_num, int(action.get("space", -1)))
        elif kind == "propose_trade":
            events = self._handle_propose_trade(player_num, action)
        elif kind == "accept_trade":
            events = self._handle_accept_trade(player_num)
        elif kind == "decline_trade":
            events = self._handle_decline_trade(player_num)
        elif kind == "cancel_trade":
            events = self._handle_cancel_trade(player_num)
        elif kind == "resign":
            events = self._handle_human_resign(player_num)
        elif kind == "end_game":
            self.state.game_over = True
            self.state.phase = "game_over"
            events = [{"type": "game_over"}]
        else:
            events = [{"type": "error", "message": f"Unknown action: {kind}"}]

        # If the active player just cleared their debt (via mortgage / trade /
        # selling houses), automatically transition out of the debt phase so
        # the End Turn button becomes available again. We do this AFTER every
        # action so it picks up indirect debt-clearing too (e.g. a trade
        # accepted by another player paid them in cash).
        self._maybe_clear_debt()
        return events

    def apply_seat_socket_lost(self, seat: int) -> list[dict]:
        """
        Websocket disconnected: seat becomes AI. Clears trades involving them.
        """
        if (
            seat < 0
            or seat >= len(self.state.players)
            or self.state.game_over
        ):
            return []
        victim = self.state.players[seat]
        if victim.resigned:
            return []
        events: list[dict] = []
        pt = self.state.pending_trade
        if pt is not None and (pt.from_player == seat or pt.to_player == seat):
            self.state.pending_trade = None
            events.append({"type": "trade_cancelled", "reason": "player_disconnected"})
        victim.is_human = False
        events.append({"type": "player_switched_to_ai", "seat": seat})

        # If they disconnected on THEIR turn, immediately hand control to AI
        # so the game can't deadlock waiting for human UI actions.
        if seat == self.state.turn and not self.state.game_over:
            phase = self.state.phase
            if phase == "waiting_for_roll":
                self.state.phase = "ai_turn"
            elif phase == "waiting_for_end_turn":
                self._advance_to_next_active_player()
            elif phase == "waiting_for_buy":
                space_num = self.state.buy_property
                if space_num is not None:
                    should_buy = ai_property_buy_check(victim, space_num, self.state.board)
                    if should_buy:
                        events.extend(self._buy_property(seat, space_num))
                    else:
                        events.append({"type": "ai_pass", "player": seat, "space": space_num})
                    self.state.buy_property = None
                    events.extend(self._after_landing(seat, creditor=None))
            elif phase == "waiting_for_chest":
                events.extend(self._acknowledge_chest())
            elif phase == "waiting_for_debt":
                creditor = self.state.debt_creditor
                events.extend(self._ai_handle_debt(seat, creditor))
                if self.state.players[seat].money < 0:
                    events.extend(self._resign_player(seat, creditor))
                self.state.debt_creditor = None
                if not self.state.game_over:
                    self._finish_landing()
        self._maybe_clear_debt()
        return events

    def run_pending_ai_turn(self) -> list[dict]:
        """Run a single AI player's turn. Caller loops while is_ai_turn()."""
        player = self.state.current_player()
        if player.is_human or self.state.game_over or player.resigned:
            return []
        ai_num = player.number
        events = self._roll_dice()

        # After the AI's roll fully resolves, see if it wants to propose a
        # trade with another AI, then invest spare cash in houses on any
        # complete set it owns. Skip the post-roll actions when:
        #   - the AI is about to re-roll (doubles),
        #   - the AI is parked on a chest waiting for human ack,
        #   - the AI just resigned mid-turn (bankruptcy), or
        #   - the game has ended on this turn.
        # ``state.turn`` may already point at the next player (turn auto-
        # advanced in ``_finish_landing`` for non-doubles AI rolls); we use
        # the cached ``ai_num`` so the trade and housing are attributed to
        # the player whose turn just ended.
        if (
            not self.state.doubles
            and self.state.phase not in ("waiting_for_chest", "waiting_for_buy")
            and not self.state.game_over
            and not self.state.players[ai_num].resigned
        ):
            events.extend(self._attempt_ai_initiated_trade(ai_num))
            events.extend(self._ai_unmortgage_properties(ai_num))
            events.extend(self._ai_buy_houses(ai_num))

        return events

    def _attempt_ai_initiated_trade(self, ai_num: int) -> list[dict]:
        """
        Look for a mutually beneficial AI-to-AI trade originating from
        ``ai_num``. If one is found, execute it and return a marker event
        (``ai_trade_initiated``) followed by the standard ``trade_accepted``
        event so the client can render a banner explaining what happened.
        After the swap completes, we also let the partner spend on houses
        immediately — the trade just handed them a fresh complete color
        set, and waiting for their own turn would feel unresponsive.
        """
        if ai_num < 0 or ai_num >= len(self.state.players):
            return []
        proposer = self.state.players[ai_num]
        if proposer.is_human or proposer.resigned:
            return []

        proposal = find_ai_trade_proposal(self.state, ai_num)
        if proposal is None:
            return []

        events: list[dict] = [{
            "type": "ai_trade_initiated",
            "fromPlayer": proposal["from_player"],
            "toPlayer": proposal["to_player"],
            "fromProperties": proposal["from_properties"],
            "toProperties": proposal["to_properties"],
            "fromMoney": proposal["from_money"],
            "toMoney": proposal["to_money"],
        }]
        events.extend(self._execute_trade(
            from_player=proposal["from_player"],
            to_player=proposal["to_player"],
            from_properties=proposal["from_properties"],
            to_properties=proposal["to_properties"],
            from_money=proposal["from_money"],
            to_money=proposal["to_money"],
            requesting_player=proposal["from_player"],
        ))
        # Trade partner gets to invest right away on their newly-completed
        # set. The proposer's housing pass runs back in run_pending_ai_turn
        # so we don't double-spend here.
        events.extend(self._ai_unmortgage_properties(proposal["to_player"]))
        events.extend(self._ai_buy_houses(proposal["to_player"]))
        return events

    # Reserve AI cash so they can still pay rent / unmortgage / lose a
    # chest fine without immediately bankrupting after a building spree.
    AI_CASH_RESERVE = 200

    @staticmethod
    def _unmortgage_price(space) -> int:
        return int(space.cost / 2 * 1.1)

    def _ai_unmortgage_properties(self, ai_num: int) -> list[dict]:
        """
        Spend surplus cash lifting mortgages on AI-owned deeds. Prioritises
        tiles in a full color monopoly (enabling rent + later houses), then
        other mortgaged buses / companies / incomplete-set properties. Each
        step keeps at least ``AI_CASH_RESERVE`` cash, matching the house-buy
        heuristic. Reuses ``_mortgage_property`` so event payloads stay
        consistent with human unmortgages.
        """
        events: list[dict] = []
        if ai_num < 0 or ai_num >= len(self.state.players):
            return events
        ai = self.state.players[ai_num]
        if ai.is_human or ai.resigned:
            return events

        def _owns_full_color_set(set_num: int) -> bool:
            if set_num is None or set_num >= 9:
                return False
            spaces = COLOR_SETS.get(set_num, [])
            return bool(spaces) and all(self.state.board[s].owner == ai_num for s in spaces)

        def _collect_mortgaged() -> tuple[list, list]:
            """Return (tier_monopoly_props, tier_other) board spaces."""
            tier_mono: list = []
            tier_other: list = []
            for space in self.state.board:
                if space.owner != ai_num or not space.mortgaged or space.houses > 0:
                    continue
                if space.subtype not in ("property", "bus", "company"):
                    continue
                cs = space.color_set
                if cs is not None and cs < 9 and _owns_full_color_set(cs):
                    tier_mono.append(space)
                else:
                    tier_other.append(space)
            tier_mono.sort(key=self._unmortgage_price)
            tier_other.sort(key=self._unmortgage_price)
            return tier_mono, tier_other

        guard = 0
        while guard < 48:
            guard += 1
            mono, other = _collect_mortgaged()
            chosen = None
            for space in mono + other:
                price = self._unmortgage_price(space)
                if ai.money - price >= self.AI_CASH_RESERVE:
                    chosen = space
                    break
            if chosen is None:
                break
            res = self._mortgage_property(ai_num, chosen.number)
            if not res or res[0].get("type") == "error":
                break
            events.extend(res)
            self._check_color_sets()
            self._update_all_worth()
        return events

    def _ai_buy_houses(self, ai_num: int) -> list[dict]:
        """
        After the AI's turn (or a trade), spend spare cash building houses
        on every complete color set the AI owns. Builds evenly within each
        set (always targets the property with the fewest houses to satisfy
        the engine's even-build rule) and prefers the cheapest house cost
        across all eligible sets so the AI invests where each dollar buys
        the most rent first. Stops the moment the next house would push
        the AI's balance below ``AI_CASH_RESERVE``.

        Returns one ``house_added`` event per house built so the client
        can animate them appearing one-by-one.
        """
        events: list[dict] = []
        if ai_num < 0 or ai_num >= len(self.state.players):
            return events
        ai = self.state.players[ai_num]
        if ai.is_human or ai.resigned:
            return events

        while True:
            best: tuple[int, int] | None = None  # (space_num, house_cost)
            for set_num, spaces in COLOR_SETS.items():
                if set_num >= 9:
                    continue
                # Must own the entire set with no mortgages.
                if not all(self.state.board[s].owner == ai_num for s in spaces):
                    continue
                if any(self.state.board[s].mortgaged for s in spaces):
                    continue
                min_houses = min(self.state.board[s].houses for s in spaces)
                if min_houses >= 5:
                    continue  # already all hotels
                # Pick the first space at the min count (even-build rule).
                for sp in spaces:
                    if self.state.board[sp].houses == min_houses:
                        cost = self.state.board[sp].house_cost
                        if best is None or cost < best[1]:
                            best = (sp, cost)
                        break
            if best is None:
                break
            space_num, house_cost = best
            if ai.money - house_cost < self.AI_CASH_RESERVE:
                break
            space = self.state.board[space_num]
            space.houses += 1
            ai.money -= house_cost
            events.append({
                "type": "house_added",
                "space": space_num,
                "houses": space.houses,
                "player": ai_num,
                "money": ai.money,
            })
        return events

    # ------------------------------------------------------------------ #
    # Authorization helpers                                              #
    # ------------------------------------------------------------------ #

    def _guard_current(self, player_num: int, expected_phase: str, fn):
        """For actions taken by the player whose turn it currently is."""
        if self.state.phase != expected_phase:
            return [{"type": "error", "message": f"Cannot do that in phase {self.state.phase}"}]
        if self.state.turn != player_num:
            return [{"type": "error", "message": "Not your turn"}]
        return fn()

    def _guard_landed(self, player_num: int, expected_phase: str, fn):
        """
        For actions resolving a landing event (buy / pass / chest). The turn
        index may have already been advanced past the landing player when the
        last roll wasn't doubles, so we accept whichever seat is the active
        landed player.
        """
        if self.state.phase != expected_phase:
            return [{"type": "error", "message": f"Cannot do that in phase {self.state.phase}"}]
        if self._landing_player_num() != player_num:
            return [{"type": "error", "message": "Not your turn"}]
        return fn()

    def _landing_player_num(self) -> int:
        # ``state.turn`` always points at the active player throughout their
        # whole turn (we no longer advance it eagerly during the dice roll),
        # so the landing player is just the current player.
        return self.state.turn

    def _guard_chest_ack(self, player_num: int) -> list[dict]:
        """
        chest_ack is special: an AI can land on a chest space but the engine
        always pauses for UI confirmation, so a connected human acks on the
        AI's behalf. Allow any seated human to ack when the landing player is
        an AI; otherwise restrict to the landing player themselves.
        """
        if self.state.phase != "waiting_for_chest":
            return [{"type": "error", "message": f"Cannot do that in phase {self.state.phase}"}]
        if player_num < 0 or player_num >= len(self.state.players):
            return [{"type": "error", "message": "Invalid seat"}]
        landed = self._landing_player_num()
        landed_player = self.state.players[landed]
        requester = self.state.players[player_num]
        if not requester.is_human:
            return [{"type": "error", "message": "Only humans can ack chest cards"}]
        if landed_player.is_human and landed != player_num:
            return [{"type": "error", "message": "Not your chest card"}]
        return self._acknowledge_chest()

    # ------------------------------------------------------------------ #
    # Core rules (ported from engine.py)                                 #
    # ------------------------------------------------------------------ #

    def _roll_dice(self) -> list[dict]:
        events: list[dict] = []
        state = self.state
        player = state.current_player()

        roll1 = random.randint(1, 6)
        roll2 = random.randint(1, 6)
        state.dice = [roll1, roll2]
        total = roll1 + roll2
        player.previous_roll = total

        if roll1 == roll2:
            state.doubles = True
            state.message = "DOUBLES!"
        else:
            state.doubles = False
            state.message = ""
        # NOTE: ``state.turn`` is NOT advanced here. It always points at the
        # player whose turn is currently in progress. Advancing happens in
        # ``_finish_landing`` (AI auto-end) or ``_end_turn`` (human-clicked).

        events.append({
            "type": "dice_roll",
            "player": player.number,
            "dice": [roll1, roll2],
            "doubles": state.doubles,
        })

        old_position = player.board_position
        new_position = old_position + total
        if new_position >= BOARD_SIZE:
            new_position -= BOARD_SIZE
            player.money += 200
            events.append({"type": "pass_go", "player": player.number, "money": player.money})

        player.board_position = new_position
        events.append({
            "type": "move",
            "player": player.number,
            "from": old_position,
            "to": new_position,
        })

        events.extend(self._handle_landing(player.number))
        return events

    def _handle_landing(self, player_num: int) -> list[dict]:
        events: list[dict] = []
        state = self.state
        player = state.players[player_num]
        space = state.board[player.board_position]

        if space.type == "go":
            player.money += 200
            state.message = "+$400"
            events.append({"type": "cash", "player": player_num, "amount": 200, "message": "+$400"})
            events.extend(self._after_landing(player_num, creditor=None))

        elif space.type == "tax":
            tax_amount = TAX_SPACES[space.number]
            player.money -= tax_amount
            state.message = f"-${tax_amount}"
            events.append({"type": "cash", "player": player_num, "amount": -tax_amount,
                           "message": f"-${tax_amount}"})
            events.extend(self._after_landing(player_num, creditor=None))

        elif space.type == "gotojail":
            player.board_position = 10
            state.message = "GO TO BRAMPTON!"
            events.append({"type": "go_to_jail", "player": player_num})
            events.extend(self._after_landing(player_num, creditor=None))

        elif space.type == "chest":
            card_index = random.randint(0, len(state._chest_cards) - 1)
            card = state._chest_cards[card_index]
            state.chest_card = card
            chest_type = "baboon_bin" if space.number in BABOON_BIN_SPACES else "healthcare_hazard"
            events.append({"type": "chest_card", "player": player_num,
                           "card": card.to_dict(), "chestType": chest_type})
            state.phase = "waiting_for_chest"

        elif space.number in PURCHASABLE_SPACES:
            if space.owner is None:
                if player.is_human:
                    state.buy_property = space.number
                    state.phase = "waiting_for_buy"
                    events.append({"type": "buy_prompt", "player": player_num, "space": space.number})
                else:
                    should_buy = ai_property_buy_check(player, space.number, state.board)
                    if should_buy:
                        events.extend(self._buy_property(player_num, space.number))
                    else:
                        events.append({"type": "ai_pass", "player": player_num, "space": space.number})
                    events.extend(self._after_landing(player_num, creditor=None))
            else:
                creditor: int | None = None
                if not space.mortgaged and space.owner != player_num:
                    events.extend(self._charge_rent(player_num, space))
                    creditor = space.owner
                events.extend(self._after_landing(player_num, creditor=creditor))

        else:
            events.extend(self._after_landing(player_num, creditor=None))

        return events

    def _after_landing(self, player_num: int, creditor: int | None) -> list[dict]:
        """
        Wrapper around ``_finish_landing`` that detects insolvency. If the
        player ended their landing actions with ``money < 0``:

        - For humans we leave the turn parked in ``waiting_for_debt`` so the
          UI can offer Manage / Trade / Resign — End Turn stays disabled
          until they bring their balance back to ``>= 0``.
        - For AIs we synchronously attempt to liquidate (sell houses,
          mortgage non-housed properties); if even that's not enough they
          resign on the spot, hand their assets to the creditor, and the
          turn moves on.

        Either way, when the player finishes solvent we just call the
        regular ``_finish_landing`` so play continues normally.
        """
        events: list[dict] = []
        state = self.state
        player = state.players[player_num]
        if player.money >= 0:
            self._finish_landing()
            return events

        state.debt_creditor = creditor
        state.phase = "waiting_for_debt"

        if player.is_human:
            # Wait for the human to mortgage / trade / resign. We do NOT
            # call _finish_landing here — the turn is paused.
            return events

        # AI must self-resolve immediately so we never sit in waiting_for_debt
        # for an AI (the human can't help them).
        events.extend(self._ai_handle_debt(player_num, creditor))
        if state.players[player_num].money < 0:
            events.extend(self._resign_player(player_num, creditor))
        # Whether they survived or resigned, clear the debt phase and
        # advance the turn as normal.
        state.debt_creditor = None
        if not state.game_over:
            self._finish_landing()
        return events

    def _finish_landing(self) -> None:
        """
        Resolve the post-landing phase for the current player.

        - If the player rolled doubles, they roll again (phase = waiting_for_roll
          for humans, ai_turn for AI). ``state.turn`` is unchanged.
        - If the player is human and rolled non-doubles, leave the turn open as
          ``waiting_for_end_turn`` so the human can mortgage / trade before
          clicking End Turn.
        - If the player is an AI and rolled non-doubles, auto-advance to the
          next player (no End Turn click required for AIs).

        Resigned players never get the dice back, so when the AI we just
        called ``_after_landing`` for has resigned mid-turn we still need to
        hand off to the next non-resigned player.
        """
        state = self.state
        current = state.players[state.turn]
        if state.doubles and not current.resigned:
            state.phase = "waiting_for_roll" if current.is_human else "ai_turn"
            return
        if current.is_human and not current.resigned:
            state.phase = "waiting_for_end_turn"
            return
        # AI / resigned player: advance to next non-resigned player.
        self._advance_to_next_active_player()

    def _advance_to_next_active_player(self) -> None:
        """
        Move ``state.turn`` to the next player who is still in the game.
        Resigned players are skipped. Sets the phase based on whether the
        new active player is human or AI. If only one (or zero) non-
        resigned player is left, the game is marked over.
        """
        state = self.state
        n = len(state.players)
        active_indices = [i for i, p in enumerate(state.players) if not p.resigned]
        if len(active_indices) <= 1:
            # Game-over case: a single survivor means we declare winner here
            # so the client renders the end-game screen instead of waiting
            # for another turn that will never come.
            state.game_over = True
            state.phase = "game_over"
            return
        next_turn = (state.turn + 1) % n
        # Walk forward (with a safety bound) until we land on an active
        # seat. ``state.turn`` itself is the only position we should NOT
        # land back on without finding someone else, but ``active_indices``
        # has >=2 players so the loop terminates.
        for _ in range(n + 1):
            if not state.players[next_turn].resigned:
                break
            next_turn = (next_turn + 1) % n
        state.turn = next_turn
        state.doubles = False
        state.phase = (
            "waiting_for_roll" if state.players[state.turn].is_human else "ai_turn"
        )

    def _acknowledge_chest(self) -> list[dict]:
        return self._execute_chest_card(self._landing_player_num())

    def _execute_chest_card(self, player_num: int) -> list[dict]:
        events: list[dict] = []
        state = self.state
        card = state.chest_card
        if card is None:
            events.extend(self._after_landing(player_num, creditor=None))
            return events

        player = state.players[player_num]
        player.money += card.money
        if card.money != 0:
            events.append({
                "type": "cash",
                "player": player_num,
                "amount": card.money,
                "message": f"+${card.money}" if card.money > 0 else f"-${abs(card.money)}",
            })

        if card.move_to is not None:
            if card.move_to < player.board_position and card.move_to != 30:
                player.money += 200
                events.append({"type": "pass_go", "player": player_num, "money": player.money})

            old_pos = player.board_position
            player.board_position = card.move_to
            events.append({"type": "move", "player": player_num, "from": old_pos, "to": card.move_to})

            if card.move_to == 30:
                player.board_position = 10
                events.append({"type": "go_to_jail", "player": player_num})
                state.chest_card = None
                events.extend(self._after_landing(player_num, creditor=None))
            else:
                state.chest_card = None
                events.extend(self._handle_landing(player_num))
        else:
            state.chest_card = None
            # A negative-money chest card (e.g. healthcare fine) is owed to
            # the bank, so creditor stays None.
            events.extend(self._after_landing(player_num, creditor=None))
        return events

    def _buy_property_action(self) -> list[dict]:
        state = self.state
        space_num = state.buy_property
        if space_num is None:
            return []
        buyer_num = self._landing_player_num()
        buyer = state.players[buyer_num]
        space = state.board[space_num]
        # Refuse the purchase if the buyer can't afford it. The client side
        # already disables the Buy button in this case, but the server has
        # the final say so a buggy / out-of-date client can't drive a player
        # into instant bankruptcy.
        if buyer.money < space.cost:
            return [{"type": "error", "message": "Not enough money to buy this property"}]
        events = self._withdraw_pending_trade_if_proposer(buyer_num)
        events.extend(self._buy_property(buyer_num, space_num))
        state.buy_property = None
        # A property purchase is paid to the bank — there's no creditor
        # even if the buyer just pushed themselves to exactly zero.
        events.extend(self._after_landing(buyer_num, creditor=None))
        return events

    def _pass_property(self) -> list[dict]:
        lander = self._landing_player_num()
        events = self._withdraw_pending_trade_if_proposer(lander)
        self.state.buy_property = None
        events.append({"type": "pass_buy"})
        events.extend(self._after_landing(lander, creditor=None))
        return events

    def _buy_property(self, player_num: int, space_num: int) -> list[dict]:
        events: list[dict] = []
        state = self.state
        player = state.players[player_num]
        space = state.board[space_num]

        space.owner = player_num
        player.money -= space.cost

        if space_num in COMPANY_SPACES:
            player.company_count += 1
        if space_num in BUS_SPACES:
            player.bus_count += 1

        self._check_color_sets()
        self._update_all_worth()

        events.append({
            "type": "property_bought",
            "player": player_num,
            "space": space_num,
            "cost": space.cost,
            "money": player.money,
        })
        return events

    def _charge_rent(self, tenant_num: int, space) -> list[dict]:
        events: list[dict] = []
        state = self.state
        tenant = state.players[tenant_num]
        owner = state.players[space.owner]

        if space.subtype == "company":
            both_owned = (state.board[12].owner == state.board[28].owner)
            rent = tenant.previous_roll * (10 if both_owned else 5)
        elif space.subtype == "bus":
            bus_count = sum(1 for s in state.board if s.subtype == "bus" and s.owner == space.owner)
            rent = int(12.5 * (2 ** bus_count))
        else:
            rent = space.rent[space.houses] if space.houses < len(space.rent) else 0

        tenant.money -= rent
        owner.money += rent

        events.append({
            "type": "rent_paid",
            "tenant": tenant_num,
            "owner": space.owner,
            "space": space.number,
            "rent": rent,
            "tenantMoney": tenant.money,
            "ownerMoney": owner.money,
        })
        return events

    def _check_color_sets(self) -> None:
        state = self.state
        for set_num, spaces in COLOR_SETS.items():
            if set_num >= 9:
                continue
            owners = [state.board[s].owner for s in spaces]
            complete = all(o is not None and o == owners[0] for o in owners)
            for s in spaces:
                state.board[s].complete_set = complete

    def _update_all_worth(self) -> None:
        for p in self.state.players:
            set_property_worth(p, self.state.board)

    def _mortgage_property(self, player_num: int, space_num: int) -> list[dict]:
        if space_num < 0 or space_num >= len(self.state.board):
            return [{"type": "error", "message": "Invalid space"}]
        space = self.state.board[space_num]
        if space.owner is None:
            return [{"type": "error", "message": "Property is unowned"}]
        if space.owner != player_num:
            return [{"type": "error", "message": "You don't own this property"}]

        player = self.state.players[space.owner]
        if not space.mortgaged:
            if space.houses > 0:
                return [{"type": "error", "message": "Cannot mortgage property with houses"}]
            space.mortgaged = True
            player.money += int(space.cost / 2)
            return [{"type": "mortgage", "space": space_num, "player": space.owner,
                     "money": player.money}]

        unmortgage_cost = int(space.cost / 2 * 1.1)
        if player.money < unmortgage_cost:
            return [{"type": "error", "message": "Not enough money to unmortgage"}]
        space.mortgaged = False
        player.money -= unmortgage_cost
        return [{"type": "unmortgage", "space": space_num, "player": space.owner,
                 "money": player.money}]

    def _add_house(self, player_num: int, space_num: int) -> list[dict]:
        if space_num < 0 or space_num >= len(self.state.board):
            return [{"type": "error", "message": "Invalid space"}]
        space = self.state.board[space_num]
        if space.owner is None or space.subtype != "property":
            return [{"type": "error", "message": "Cannot add house here"}]
        if space.owner != player_num:
            return [{"type": "error", "message": "You don't own this property"}]

        player = self.state.players[space.owner]
        if space.houses >= 5:
            return [{"type": "error", "message": "Maximum houses reached"}]
        if space.mortgaged:
            return [{"type": "error", "message": "Cannot add house to mortgaged property"}]
        if not space.complete_set:
            return [{"type": "error", "message": "Need complete set to add houses"}]
        if player.money < space.house_cost:
            return [{"type": "error", "message": "Not enough money"}]

        for s_num in COLOR_SETS.get(space.color_set, []):
            if space.houses == self.state.board[s_num].houses + 1:
                return [{"type": "error", "message": "Must build evenly across color set"}]

        space.houses += 1
        player.money -= space.house_cost
        return [{"type": "house_added", "space": space_num, "houses": space.houses,
                 "player": space.owner, "money": player.money}]

    def _remove_house(self, player_num: int, space_num: int) -> list[dict]:
        if space_num < 0 or space_num >= len(self.state.board):
            return [{"type": "error", "message": "Invalid space"}]
        space = self.state.board[space_num]
        if space.owner is None or space.subtype != "property":
            return [{"type": "error", "message": "Cannot remove house here"}]
        if space.owner != player_num:
            return [{"type": "error", "message": "You don't own this property"}]
        if space.houses <= 0:
            return [{"type": "error", "message": "No houses to remove"}]
        if space.mortgaged:
            return [{"type": "error", "message": "Property is mortgaged"}]

        for s_num in COLOR_SETS.get(space.color_set, []):
            if space.houses == self.state.board[s_num].houses - 1:
                return [{"type": "error", "message": "Must sell evenly across color set"}]

        player = self.state.players[space.owner]
        space.houses -= 1
        player.money += int(space.house_cost / 2)
        return [{"type": "house_removed", "space": space_num, "houses": space.houses,
                 "player": space.owner, "money": player.money}]

    def _pending_trade_blocks_turn_advance(self, player_num: int) -> list[dict] | None:
        pt = self.state.pending_trade
        if pt is None:
            return None
        if pt.from_player != player_num or self.state.turn != player_num:
            return None
        return [{
            "type": "error",
            "message": "Resolve or withdraw your trade offer before rolling or ending your turn",
        }]

    def _withdraw_pending_trade_if_proposer(self, proposer_num: int) -> list[dict]:
        pt = self.state.pending_trade
        if pt is not None and pt.from_player == proposer_num:
            self.state.pending_trade = None
            return [{"type": "trade_cancelled", "reason": "superseded"}]
        return []

    def _validate_trade_terms(
        self,
        from_player: int,
        to_player: int,
        from_properties: list[int],
        to_properties: list[int],
        from_money: int,
        to_money: int,
    ) -> list[dict]:
        if to_player == from_player:
            return [{"type": "error", "message": "Cannot trade with yourself"}]
        if to_player < 0 or to_player >= len(self.state.players):
            return [{"type": "error", "message": "Invalid trade target"}]
        if from_player < 0 or from_player >= len(self.state.players):
            return [{"type": "error", "message": "Invalid trade source"}]
        if self.state.players[from_player].resigned:
            return [{"type": "error", "message": "You have already resigned"}]
        if self.state.players[to_player].resigned:
            return [{"type": "error", "message": "That player has resigned"}]
        if from_money < 0 or to_money < 0:
            return [{"type": "error", "message": "Invalid money amounts"}]

        p_from = self.state.players[from_player]
        p_to = self.state.players[to_player]
        if from_money > p_from.money:
            return [{"type": "error", "message": "You cannot offer more cash than you have"}]
        if to_money > p_to.money:
            return [{"type": "error", "message": "Cannot ask for more cash than they have"}]

        def _set_has_houses(color_set: int | None) -> bool:
            if color_set is None:
                return False
            for s in self.state.board:
                if s.subtype != "property":
                    continue
                if s.color_set == color_set and s.houses > 0:
                    return True
            return False

        for sp_num in from_properties:
            if sp_num < 0 or sp_num >= len(self.state.board):
                return [{"type": "error", "message": "Invalid property in trade"}]
            space = self.state.board[sp_num]
            if space.owner != from_player:
                return [{"type": "error", "message": "You don't own one of those properties"}]
            if space.houses > 0:
                return [{"type": "error", "message": "Cannot trade properties with houses"}]
            if _set_has_houses(space.color_set):
                return [{
                    "type": "error",
                    "message": "Cannot trade any property from a set that has houses",
                }]
        for sp_num in to_properties:
            if sp_num < 0 or sp_num >= len(self.state.board):
                return [{"type": "error", "message": "Invalid property in trade"}]
            space = self.state.board[sp_num]
            if space.owner != to_player:
                return [{"type": "error", "message": "Target doesn't own one of those properties"}]
            if space.houses > 0:
                return [{"type": "error", "message": "Cannot trade properties with houses"}]
            if _set_has_houses(space.color_set):
                return [{
                    "type": "error",
                    "message": "Cannot trade any property from a set that has houses",
                }]
        return []

    def _apply_trade_swap(
        self,
        from_player: int,
        to_player: int,
        from_properties: list[int],
        to_properties: list[int],
        from_money: int,
        to_money: int,
    ) -> list[dict]:
        p_from = self.state.players[from_player]
        p_to = self.state.players[to_player]
        p_from.money += to_money - from_money
        p_to.money += from_money - to_money

        for sp_num in from_properties:
            space = self.state.board[sp_num]
            if space.subtype == "company":
                p_from.company_count -= 1
                p_to.company_count += 1
            if space.subtype == "bus":
                p_from.bus_count -= 1
                p_to.bus_count += 1
            space.owner = to_player

        for sp_num in to_properties:
            space = self.state.board[sp_num]
            if space.subtype == "company":
                p_to.company_count -= 1
                p_from.company_count += 1
            if space.subtype == "bus":
                p_to.bus_count -= 1
                p_from.bus_count += 1
            space.owner = from_player

        self._check_color_sets()
        self._update_all_worth()

        return [{
            "type": "trade_accepted",
            "fromPlayer": from_player,
            "toPlayer": to_player,
            "fromProperties": from_properties,
            "toProperties": to_properties,
            "fromMoney": from_money,
            "toMoney": to_money,
        }]

    def _handle_propose_trade(self, player_num: int, action: dict) -> list[dict]:
        from_player = int(action.get("fromPlayer", player_num))
        to_player = int(action.get("toPlayer", -1))
        from_properties = list(action.get("fromProperties", []))
        to_properties = list(action.get("toProperties", []))
        from_money = int(action.get("fromMoney", 0))
        to_money = int(action.get("toMoney", 0))

        if player_num != from_player:
            return [{"type": "error", "message": "Can only trade as yourself"}]

        err = self._validate_trade_terms(
            from_player, to_player,
            from_properties, to_properties,
            from_money, to_money,
        )
        if err:
            return err

        if not (from_properties or from_money) or not (to_properties or to_money):
            return [{"type": "error", "message": "Trade must include something from each side"}]

        if self.state.pending_trade is not None:
            return [{"type": "error", "message": "Another trade offer is already pending"}]

        target = self.state.players[to_player]
        if target.is_human:
            self.state.pending_trade = PendingTrade(
                from_player=from_player,
                to_player=to_player,
                from_properties=from_properties,
                to_properties=to_properties,
                from_money=from_money,
                to_money=to_money,
            )
            return [{
                "type": "trade_proposed",
                "fromPlayer": from_player,
                "toPlayer": to_player,
                "fromProperties": from_properties,
                "toProperties": to_properties,
                "fromMoney": from_money,
                "toMoney": to_money,
            }]

        return self._execute_trade(
            from_player, to_player,
            from_properties, to_properties,
            from_money, to_money,
            requesting_player=player_num,
        )

    def _handle_accept_trade(self, player_num: int) -> list[dict]:
        pt = self.state.pending_trade
        if pt is None:
            return [{"type": "error", "message": "No pending trade"}]
        if player_num != pt.to_player:
            return [{"type": "error", "message": "Only the recipient can accept this offer"}]

        err = self._validate_trade_terms(
            pt.from_player, pt.to_player,
            pt.from_properties, pt.to_properties,
            pt.from_money, pt.to_money,
        )
        if err:
            self.state.pending_trade = None
            return err

        self.state.pending_trade = None
        return self._apply_trade_swap(
            pt.from_player, pt.to_player,
            pt.from_properties, pt.to_properties,
            pt.from_money, pt.to_money,
        )

    def _handle_decline_trade(self, player_num: int) -> list[dict]:
        pt = self.state.pending_trade
        if pt is None:
            return [{"type": "error", "message": "No pending trade"}]
        if player_num != pt.to_player:
            return [{"type": "error", "message": "Only the recipient can decline this offer"}]
        self.state.pending_trade = None
        return [{"type": "trade_denied"}]

    def _handle_cancel_trade(self, player_num: int) -> list[dict]:
        pt = self.state.pending_trade
        if pt is None:
            return [{"type": "error", "message": "No pending trade"}]
        if player_num != pt.from_player:
            return [{"type": "error", "message": "Only the proposer can withdraw this offer"}]
        self.state.pending_trade = None
        return [{"type": "trade_cancelled", "reason": "withdrawn"}]

    def _execute_trade(
        self,
        from_player: int,
        to_player: int,
        from_properties: list[int],
        to_properties: list[int],
        from_money: int,
        to_money: int,
        requesting_player: int,
    ) -> list[dict]:
        if requesting_player != from_player:
            return [{"type": "error", "message": "Can only trade as yourself"}]
        err = self._validate_trade_terms(
            from_player, to_player,
            from_properties, to_properties,
            from_money, to_money,
        )
        if err:
            return err

        target = self.state.players[to_player]
        if not target.is_human:
            accepted = ai_trade_check(
                self.state, from_player, to_player,
                from_properties, to_properties,
                from_money, to_money,
            )
            if not accepted:
                return [{"type": "trade_denied"}]

        return self._apply_trade_swap(
            from_player, to_player,
            from_properties, to_properties,
            from_money, to_money,
        )

    # ------------------------------------------------------------------ #
    # Bankruptcy / resignation                                           #
    # ------------------------------------------------------------------ #

    def _ai_handle_debt(self, ai_num: int, _creditor: int | None) -> list[dict]:
        """
        Liquidate AI assets just enough to bring their balance back to
        ``>= 0``. Strategy:

        1. Sell houses one-by-one, choosing the most expensive house cost
           still standing (highest impact, cheapest sets last). The
           even-sell rule means we always pull from a property currently at
           the max house count in its color set.
        2. Once a property has 0 houses, mortgage it. We mortgage the most
           expensive (most cash) un-mortgaged, no-house property first.
        3. Repeat until either ``money >= 0`` or there's nothing left to
           sell — in which case ``_after_landing`` will follow up with
           ``_resign_player``.

        Returns one event per liquidation step so the client can animate
        the houses coming down and the mortgage stripes going up.
        """
        events: list[dict] = []
        ai = self.state.players[ai_num]
        if ai.is_human:
            return events

        def _sell_one_house() -> dict | None:
            # Walk color sets from most-expensive house to cheapest so we
            # raise the most cash per click. Within a set, the even-sell
            # rule means we have to pull from a property that's currently
            # at the set's max house count.
            for set_num in sorted(COLOR_SETS.keys(), reverse=True):
                if set_num >= 9:
                    continue
                spaces = COLOR_SETS[set_num]
                if not all(self.state.board[s].owner == ai_num for s in spaces):
                    continue
                max_houses = max(self.state.board[s].houses for s in spaces)
                if max_houses == 0:
                    continue
                for sp in spaces:
                    if self.state.board[sp].houses == max_houses:
                        space = self.state.board[sp]
                        space.houses -= 1
                        ai.money += int(space.house_cost / 2)
                        return {
                            "type": "house_removed",
                            "space": sp,
                            "houses": space.houses,
                            "player": ai_num,
                            "money": ai.money,
                        }
            return None

        def _mortgage_one() -> dict | None:
            candidates = [
                s for s in self.state.board
                if s.owner == ai_num
                and not s.mortgaged
                and s.houses == 0
                and s.subtype is not None
            ]
            if not candidates:
                return None
            candidates.sort(key=lambda s: s.cost, reverse=True)
            space = candidates[0]
            space.mortgaged = True
            ai.money += int(space.cost / 2)
            return {
                "type": "mortgage",
                "space": space.number,
                "player": ai_num,
                "money": ai.money,
            }

        # Safety bound: there's a finite number of houses + properties an
        # AI can liquidate, so this loop terminates either via the helper
        # returning None or by money returning to >= 0.
        guard = 0
        while ai.money < 0 and guard < 200:
            guard += 1
            ev = _sell_one_house()
            if ev is None:
                ev = _mortgage_one()
            if ev is None:
                break
            events.append(ev)

        # Houses were sold and properties potentially mortgaged — recompute
        # complete-set status and AI worth so the next decision (e.g. a
        # follow-up rent calculation) sees the up-to-date board.
        self._check_color_sets()
        self._update_all_worth()
        return events

    def _resign_player(self, player_num: int, creditor: int | None) -> list[dict]:
        """
        Mark a player as resigned and transfer their assets. If a
        ``creditor`` is supplied (rent-debt case), every property they own
        moves to that creditor along with any houses / hotels still on it.
        Otherwise (tax / chest fines, or the creditor is themselves
        resigned) the properties revert to the bank — owner cleared,
        houses and mortgage reset.

        Whatever remaining cash the resigning player has is also handed
        to the creditor (or absorbed by the bank). After everything
        settles we re-check color sets and AI valuations, and if only a
        single non-resigned player remains the game is declared over.
        """
        events: list[dict] = []
        state = self.state
        player = state.players[player_num]
        if player.resigned:
            return events

        # Resolve creditor: if they're invalid or also resigned, treat the
        # debt as owed to the bank.
        creditor_player = None
        if creditor is not None and 0 <= creditor < len(state.players):
            cand = state.players[creditor]
            if not cand.resigned:
                creditor_player = cand

        transferred: list[int] = []
        voided: list[int] = []
        for space in state.board:
            if space.owner != player_num:
                continue
            if creditor_player is not None:
                space.owner = creditor_player.number
                if space.subtype == "company":
                    creditor_player.company_count += 1
                    player.company_count = max(0, player.company_count - 1)
                if space.subtype == "bus":
                    creditor_player.bus_count += 1
                    player.bus_count = max(0, player.bus_count - 1)
                transferred.append(space.number)
            else:
                space.owner = None
                space.houses = 0
                space.mortgaged = False
                if space.subtype == "company":
                    player.company_count = max(0, player.company_count - 1)
                if space.subtype == "bus":
                    player.bus_count = max(0, player.bus_count - 1)
                voided.append(space.number)

        # Remaining cash. Negative balances mean the bank / creditor eats
        # the loss; we never want a resigned player to display negative $.
        leftover = player.money
        if leftover > 0 and creditor_player is not None:
            creditor_player.money += leftover
        player.money = 0
        # Stamp the resignation order BEFORE flipping the resigned flag so
        # the end-game leaderboard can rank losers by reverse order
        # (last to resign places higher than first to resign).
        existing_orders = [
            p.resignation_order for p in state.players
            if p.resignation_order is not None
        ]
        player.resignation_order = (max(existing_orders) + 1) if existing_orders else 1
        player.resigned = True

        self._check_color_sets()
        self._update_all_worth()

        events.append({
            "type": "player_resigned",
            "player": player_num,
            "creditor": creditor_player.number if creditor_player else None,
            "transferredProperties": transferred,
            "voidedProperties": voided,
            "moneyTransferred": max(0, leftover) if creditor_player is not None else 0,
        })

        # Sole-survivor end condition: at most one non-resigned player.
        active = [p for p in state.players if not p.resigned]
        if len(active) <= 1:
            state.game_over = True
            state.phase = "game_over"
            events.append({"type": "game_over"})

        return events

    def _handle_human_resign(self, player_num: int) -> list[dict]:
        """
        Process a human-clicked Resign. The resigning player is removed from
        play (their assets transfer as usual), but the game continues as long
        as at least two non-resigned players remain.
        """
        state = self.state
        if player_num < 0 or player_num >= len(state.players):
            return [{"type": "error", "message": "Invalid seat"}]
        player = state.players[player_num]
        if not player.is_human:
            return [{"type": "error", "message": "Only humans use the resign action"}]
        if player.resigned:
            return [{"type": "error", "message": "Already resigned"}]
        if state.turn != player_num:
            return [{"type": "error", "message": "Only the active player can resign"}]
        if state.phase != "waiting_for_debt":
            return [{"type": "error", "message": "Resign is only available while in debt"}]

        creditor = state.debt_creditor
        events = self._resign_player(player_num, creditor)
        state.debt_creditor = None
        if not state.game_over:
            self._advance_to_next_active_player()
        return events

    def _maybe_clear_debt(self) -> None:
        """
        Run after every ``handle_action``: if the active player has paid
        down their debt (via mortgage / sell-house / a successful trade),
        bring them back into ``waiting_for_end_turn`` so the End Turn
        button unlocks.
        """
        state = self.state
        if state.phase != "waiting_for_debt":
            return
        if state.turn < 0 or state.turn >= len(state.players):
            return
        current = state.players[state.turn]
        if current.resigned:
            # Resignation already advanced phase elsewhere; just reset.
            state.debt_creditor = None
            return
        if current.money >= 0:
            state.debt_creditor = None
            state.phase = "waiting_for_end_turn"

    def _end_turn(self) -> list[dict]:
        """
        Human-clicked End Turn. Refuse if the active player is still in
        debt (we never want to roll the next dice while their balance is
        negative — they have to clear it or resign first). Otherwise
        advance through the rotation, skipping resigned seats.
        """
        state = self.state
        current = state.players[state.turn]
        if current.money < 0:
            return [{"type": "error", "message": "Clear your debts before ending your turn"}]
        self._advance_to_next_active_player()
        return [{"type": "turn_ended", "player": state.turn}]
