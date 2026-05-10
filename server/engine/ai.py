"""
AI decision logic — ported from Objects.py player methods.
Pure logic, no UI dependencies.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from .constants import BUS_SPACES, COLOR_SETS, TWO_PROPERTY_SETS

if TYPE_CHECKING:
    from .models import BoardSpace, GameState, Player


def set_property_worth(player: Player, board: list[BoardSpace]) -> None:
    """Recalculate the AI worth_dict for a player based on current board ownership."""
    for item in player.worth_dict:
        owned_in_set = 0
        target_space = board[item]
        for space in board:
            if space.color_set == target_space.color_set and space.color_set is not None:
                if space.owner == player.number and space.owner is not None:
                    owned_in_set += 1
                    if space.number in [1, 3, 37, 39]:
                        owned_in_set *= 2

        if item not in BUS_SPACES:
            player.worth_dict[item] = (board[item].cost / 10) * ((2 ** owned_in_set) ** owned_in_set)
        else:
            player.worth_dict[item] = (board[item].cost / 10) * (2 ** owned_in_set)


def ai_property_buy_check(player: Player, space_num: int, board: list[BoardSpace]) -> bool:
    """Decide whether an AI player should buy a property. Returns True to buy."""
    if space_num not in player.worth_dict:
        return player.money >= board[space_num].cost
    buy_value = player.worth_dict[space_num] * (player.money - board[space_num].cost)
    return buy_value >= 2200


def ai_trade_check(
    state: GameState,
    from_player: int,
    to_player: int,
    from_properties: list[int],
    to_properties: list[int],
    from_money: int,
    to_money: int,
) -> bool:
    """
    Decide whether the AI (to_player) accepts a trade.
    Ported from player.ai_trade_check in Objects.py.
    """
    board = state.board
    ai = state.players[to_player]

    worth_from = 0.0
    worth_to = 0.0

    # Value of money being offered
    if from_money > 0:
        money_val = from_money * 5 // ((max(ai.money, 100) ** 0.5) ** 0.5)
        worth_from += money_val
    if to_money > 0:
        money_val = to_money * 5 // ((min(ai.money, 100) ** 0.5) ** 0.5)
        worth_to += money_val

    # Value properties being given to AI (from_properties)
    for sp_num in from_properties:
        space = board[sp_num]
        worth_from += space.cost / 2
        owned_in_set = 0
        for other in board:
            if other.color_set == space.color_set and other.color_set is not None:
                if other.owner == to_player and other.number != sp_num:
                    owned_in_set += 1
                    if other.number in [1, 3, 37, 39]:
                        owned_in_set *= 2
        for other_sp in from_properties:
            if other_sp != sp_num and board[other_sp].color_set == space.color_set:
                owned_in_set += 1
                if other_sp in [1, 3, 37, 39]:
                    owned_in_set *= 2

        if sp_num not in BUS_SPACES:
            worth_from += (space.cost / 10) * ((2 ** owned_in_set) ** owned_in_set)
        else:
            worth_from += (space.cost / 10) * (2 ** owned_in_set)

    # Value properties AI is giving away (to_properties)
    for sp_num in to_properties:
        space = board[sp_num]
        worth_to += space.cost / 2
        owned_in_set = 0
        for other in board:
            if other.color_set == space.color_set and other.color_set is not None:
                if other.owner == from_player and other.number != sp_num:
                    owned_in_set += 1
                    if other.number in [1, 3, 37, 39]:
                        owned_in_set *= 2
        for other_sp in to_properties:
            if other_sp != sp_num and board[other_sp].color_set == space.color_set:
                owned_in_set += 1
                if other_sp in [1, 3, 37, 39]:
                    owned_in_set *= 2

        if sp_num not in BUS_SPACES:
            worth_to += (space.cost / 10) * ((2 ** owned_in_set) ** owned_in_set)
        else:
            worth_to += (space.cost / 10) * (2 ** owned_in_set)

    return worth_from >= worth_to


def find_ai_trade_proposal(
    state: GameState, from_ai_num: int
) -> Optional[dict]:
    """
    Search for a 1-for-1 property swap between the given AI and another
    AI player where BOTH sides immediately complete a color set as a
    result. The deal is balanced with a cash payment equal to half of the
    raw property-cost difference, so the side giving up the more expensive
    property is paid the difference.

    We deliberately do NOT route this through ``ai_trade_check``. That
    function is tuned for human-vs-AI exchanges (it's stingy by design,
    e.g. it values incoming cash less than outgoing cash to deter scams);
    plugging it in here would block obviously-mutual swaps whenever the
    two color sets have unequal property costs. Instead, we lean on the
    structural guarantee that BOTH AIs gain a full color set, which is a
    huge strategic win for both — and the cost-difference cash payment
    keeps things feeling fair.

    Returns a dict shaped like the ``propose_trade`` action payload, or
    ``None`` if no mutually set-completing trade exists.
    """
    board = state.board
    from_ai = state.players[from_ai_num]
    if from_ai.is_human or from_ai.resigned:
        return None

    # Map every color set (1-8) to who owns each piece. Sets 9 and 10 are
    # companies / buses and don't have the "complete to build houses"
    # property we care about for this heuristic.
    set_ownership: dict[int, dict[int, list[int]]] = {}
    for set_num, set_spaces in COLOR_SETS.items():
        if set_num >= 9:
            continue
        owners: dict[int, list[int]] = {}
        for sp in set_spaces:
            owner = board[sp].owner
            if owner is not None:
                owners.setdefault(owner, []).append(sp)
        set_ownership[set_num] = owners

    def missing_one(set_num: int, who: int) -> Optional[int]:
        """Return the single missing space in ``set_num`` for ``who`` if
        they're one piece short and the rest belongs to a single other
        player; otherwise None."""
        spaces = COLOR_SETS[set_num]
        owners = set_ownership.get(set_num, {})
        my_count = len(owners.get(who, []))
        if my_count == 0 or my_count >= len(spaces):
            return None
        others_in_set = [o for o in owners if o != who]
        if len(others_in_set) != 1:
            return None
        other = others_in_set[0]
        if len(owners[other]) + my_count != len(spaces):
            return None  # there's an unowned piece — can't acquire by trade
        return owners[other][0]

    # Find every set ``from_ai`` is one piece away from completing, with
    # the candidate (set_num, other_ai, their_property) tuple.
    targets: list[tuple[int, int, int]] = []
    for set_num in set_ownership:
        their_prop = missing_one(set_num, from_ai_num)
        if their_prop is None:
            continue
        other_owner = board[their_prop].owner
        if other_owner is None:
            continue
        other_player = state.players[other_owner]
        if other_player.is_human or other_player.resigned:
            continue  # AI-to-AI trades only, never with resigned AI
        if board[their_prop].houses > 0:
            continue
        targets.append((set_num, other_owner, their_prop))

    if not targets:
        return None

    for _our_set_num, other_ai_num, their_prop in targets:
        other_ai = state.players[other_ai_num]
        for other_set_num in set_ownership:
            if board[their_prop].color_set == other_set_num:
                continue  # don't propose pieces from the same set
            our_prop = missing_one(other_set_num, other_ai_num)
            if our_prop is None:
                continue
            if board[our_prop].owner != from_ai_num:
                continue
            if board[our_prop].houses > 0:
                continue

            cost_ours = board[our_prop].cost
            cost_theirs = board[their_prop].cost
            # Half of the raw property-cost gap, paid by whoever receives
            # the more valuable property. This keeps the deal feeling fair
            # without nuking either player's cash reserves.
            balance = abs(cost_ours - cost_theirs) // 2
            from_money = 0
            to_money = 0
            if cost_theirs > cost_ours:
                # from_ai receives the pricier property → from_ai pays.
                from_money = balance
            elif cost_ours > cost_theirs:
                # other_ai receives the pricier property → other_ai pays.
                to_money = balance

            # Don't let either AI spend more than they own.
            if from_money > from_ai.money or to_money > other_ai.money:
                continue
            return {
                "from_player": from_ai_num,
                "to_player": other_ai_num,
                "from_properties": [our_prop],
                "to_properties": [their_prop],
                "from_money": from_money,
                "to_money": to_money,
            }

    return None
