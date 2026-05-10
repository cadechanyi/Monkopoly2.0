"""
Pure data models for the Monkopoly game. No UI dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .constants import (
    BOARD_SPACES,
    CHEST_CARDS,
    INITIAL_WORTH_DICT,
    NUM_PLAYERS,
    PLAYER_COLORS,
    STARTING_MONEY,
)


@dataclass
class BoardSpace:
    number: int
    x: int
    y: int
    name: str
    type: str  # "go", "property", "chest", "tax", "jail", "lunch", "gotojail"
    subtype: Optional[str]  # "property", "bus", "company", or None
    cost: int
    rent: list[int]  # rent0..rent5
    house_cost: int
    color_set: Optional[int]
    owner: Optional[int] = None  # player number, or None if unowned
    houses: int = 0
    mortgaged: bool = False
    complete_set: bool = False

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "x": self.x,
            "y": self.y,
            "name": self.name,
            "type": self.type,
            "subtype": self.subtype,
            "cost": self.cost,
            "rent": self.rent,
            "houseCost": self.house_cost,
            "colorSet": self.color_set,
            "owner": self.owner,
            "houses": self.houses,
            "mortgaged": self.mortgaged,
            "completeSet": self.complete_set,
        }


@dataclass
class ChestCard:
    text: str
    move_to: Optional[int]
    money: int

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "moveTo": self.move_to,
            "money": self.money,
        }


@dataclass
class Player:
    number: int
    color: str
    color2: str
    color3: str
    is_human: bool
    money: int
    board_position: int = 0
    previous_roll: int = 0
    company_count: int = 0
    bus_count: int = 0
    worth_dict: dict = field(default_factory=dict)
    # ``resigned`` players are out of the game: their token is removed from
    # the board, their assets have been transferred (to a creditor or the
    # bank), and the turn rotation skips over them.
    resigned: bool = False
    # 1-based sequence number capturing the ORDER in which players resigned.
    # The first player to resign gets 1, the next gets 2, etc. Used by the
    # end-game leaderboard to rank losers: a higher number means the player
    # survived longer and therefore places higher among the resignees.
    # ``None`` for players who never resigned (i.e. still alive at game end).
    resignation_order: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "color": self.color,
            "color2": self.color2,
            "color3": self.color3,
            "isHuman": self.is_human,
            "money": self.money,
            "boardPosition": self.board_position,
            "previousRoll": self.previous_roll,
            "companyCount": self.company_count,
            "busCount": self.bus_count,
            "resigned": self.resigned,
            "resignationOrder": self.resignation_order,
        }


@dataclass
class PendingTrade:
    """Human-to-human offer awaiting the recipient's accept / decline."""

    from_player: int
    to_player: int
    from_properties: list[int] = field(default_factory=list)
    to_properties: list[int] = field(default_factory=list)
    from_money: int = 0
    to_money: int = 0

    def to_dict(self) -> dict:
        return {
            "fromPlayer": self.from_player,
            "toPlayer": self.to_player,
            "fromProperties": self.from_properties,
            "toProperties": self.to_properties,
            "fromMoney": self.from_money,
            "toMoney": self.to_money,
        }


@dataclass
class GameState:
    board: list[BoardSpace]
    players: list[Player]
    turn: int = 0
    doubles: bool = False
    dice: list[int] = field(default_factory=lambda: [0, 0])
    phase: str = "waiting_for_roll"
    message: str = ""
    chest_card: Optional[ChestCard] = None
    buy_property: Optional[int] = None  # space number of property available to buy
    game_over: bool = False
    # When the active player goes negative, this is the seat they owe (the
    # creditor that gets all their assets if they resign). ``None`` means
    # the debt is to the bank (tax / chest fine), in which case any
    # transferred assets simply revert to unowned.
    debt_creditor: Optional[int] = None
    pending_trade: Optional[PendingTrade] = None

    def to_dict(self) -> dict:
        return {
            "turn": self.turn,
            "doubles": self.doubles,
            "dice": self.dice,
            "phase": self.phase,
            "message": self.message,
            "chestCard": self.chest_card.to_dict() if self.chest_card else None,
            "buyProperty": self.buy_property,
            "gameOver": self.game_over,
            "debtCreditor": self.debt_creditor,
            "pendingTrade": self.pending_trade.to_dict() if self.pending_trade else None,
            "players": [p.to_dict() for p in self.players],
            "board": [s.to_dict() for s in self.board],
            "availableActions": self._available_actions(),
        }

    def _strip_actions_if_waiting_on_trade_response(self, actions: list[str]) -> list[str]:
        """
        While a human trade offer is open, the proposer cannot roll or end
        their turn until the other player responds or the offer is withdrawn.
        """
        pt = self.pending_trade
        if pt is None or self.game_over:
            return actions
        if self.turn != pt.from_player:
            return actions
        return [a for a in actions if a not in ("roll", "end_turn")]

    def _available_actions(self) -> list[str]:
        if self.game_over:
            base = ["new_game"]
        elif self.phase == "waiting_for_roll":
            base = ["roll", "manage", "trade", "end_game"]
        elif self.phase == "waiting_for_buy":
            # Allow manage / trade so the human can mortgage or trade their
            # way to the cash needed to buy the prompted property.
            base = ["buy", "pass", "manage", "trade"]
        elif self.phase == "waiting_for_chest":
            base = ["chest_ack"]
        elif self.phase == "waiting_for_debt":
            # End Turn is intentionally excluded — the player must clear
            # their negative balance via manage / trade or resign.
            base = ["manage", "trade", "resign"]
        elif self.phase == "waiting_for_end_turn":
            base = ["end_turn", "manage", "trade", "end_game"]
        elif self.phase == "ai_turn":
            base = []
        else:
            base = []
        return self._strip_actions_if_waiting_on_trade_response(base)

    def current_player(self) -> Player:
        return self.players[self.turn]


def create_initial_state(
    *,
    seat_is_human: tuple[bool, bool, bool, bool],
) -> GameState:
    """
    Exactly four seats; ``seat_is_human[i]`` marks who is controlled by a human
    at game start (all others run as AI).
    """
    if len(seat_is_human) != NUM_PLAYERS:
        raise ValueError("seat_is_human must have length NUM_PLAYERS")
    humans = sum(1 for h in seat_is_human if h)
    if humans < 1:
        raise ValueError("Need at least one human seat")

    board = []
    for space_data in BOARD_SPACES:
        board.append(BoardSpace(
            number=space_data["number"],
            x=space_data["x"],
            y=space_data["y"],
            name=space_data["name"],
            type=space_data["type"],
            subtype=space_data["subtype"],
            cost=space_data["cost"],
            rent=list(space_data["rent"]),
            house_cost=space_data["house_cost"],
            color_set=space_data["color_set"],
        ))

    players = []
    for i in range(NUM_PLAYERS):
        pdata = PLAYER_COLORS[i]
        players.append(Player(
            number=pdata["number"],
            color=pdata["color"],
            color2=pdata["color2"],
            color3=pdata["color3"],
            is_human=seat_is_human[i],
            money=STARTING_MONEY,
            worth_dict=dict(INITIAL_WORTH_DICT),
        ))

    chest_cards = [
        ChestCard(text=c["text"], move_to=c["move_to"], money=c["money"])
        for c in CHEST_CARDS
    ]

    state = GameState(board=board, players=players)
    state._chest_cards = chest_cards
    # Turn order always starts at seat 0. If that seat is AI, the phase must
    # be ``ai_turn`` so the websocket layer's ``_drain_ai`` loop runs; leaving
    # ``waiting_for_roll`` would deadlock (no human occupies seat 0 to roll).
    if not state.players[0].is_human:
        state.phase = "ai_turn"
    return state
