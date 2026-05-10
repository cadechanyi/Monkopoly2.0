"""
Board space definitions, chest cards, and player config — pure data, no UI dependencies.
Extracted from the original Objects.py / Labels.py tkinter application.
"""

# Image file mapping: board space number -> image filename (for property cards)
PROPERTY_IMAGES = {
    1: "caledon.png",
    3: "milton.png",
    5: "waynebus.png",
    6: "angola.png",
    8: "somalia.png",
    9: "chad.png",
    11: "scarborough.png",
    12: "pepsicompany.png",
    13: "Markham.png",
    14: "primarycampus.png",
    15: "jeffbus.png",
    16: "gcp.png",
    18: "mentorlobby.png",
    19: "bhavbarn.png",
    21: "mentorgym.png",
    23: "northkorea.png",
    24: "mentoroffice.png",
    25: "smithbus.png",
    26: "yehiapyramid.png",
    27: "egypt.png",
    28: "cokecompany.png",
    29: "landdownunder.png",
    31: "evancamp.png",
    32: "greenwood.png",
    34: "oakville.png",
    35: "danbus.png",
    37: "crystalcove.png",
    39: "jungleofmonkeys.png",
}

# Color sets: set_number -> list of board space numbers in that set
COLOR_SETS = {
    1: [1, 3],
    2: [6, 8, 9],
    3: [11, 13, 14],
    4: [16, 18, 19],
    5: [21, 23, 24],
    6: [26, 27, 29],
    7: [31, 32, 34],
    8: [37, 39],
    9: [12, 28],       # companies
    10: [5, 15, 25, 35],  # buses
}

# Board space definitions: each dict has all the data from the original boardplaces constructor,
# minus tkinter widget references (label, tradelb, smallerlabel).
# Fields: number, x, y, name, type, subtype, cost, rent0-5, house_cost, color_set
BOARD_SPACES = [
    {"number": 0, "x": 640, "y": 715, "name": "GO", "type": "go", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 1, "x": 588, "y": 715, "name": "Caledon", "type": "property", "subtype": "property", "cost": 60, "rent": [2, 10, 30, 90, 160, 250], "house_cost": 50, "color_set": 1},
    {"number": 2, "x": 528, "y": 715, "name": "Baboon Bin", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 3, "x": 474, "y": 715, "name": "Milton", "type": "property", "subtype": "property", "cost": 60, "rent": [4, 20, 60, 180, 320, 450], "house_cost": 50, "color_set": 1},
    {"number": 4, "x": 416, "y": 715, "name": "Mentor School Fees 200", "type": "tax", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 5, "x": 358, "y": 715, "name": "Wayne Bus", "type": "property", "subtype": "bus", "cost": 200, "rent": [25, 50, 100, 200, 0, 0], "house_cost": 0, "color_set": 10},
    {"number": 6, "x": 301, "y": 715, "name": "Angola", "type": "property", "subtype": "property", "cost": 100, "rent": [6, 30, 90, 270, 400, 550], "house_cost": 50, "color_set": 2},
    {"number": 7, "x": 248, "y": 715, "name": "Healthcare Hazard", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 8, "x": 186, "y": 715, "name": "Somalia", "type": "property", "subtype": "property", "cost": 100, "rent": [6, 30, 90, 270, 400, 550], "house_cost": 50, "color_set": 2},
    {"number": 9, "x": 129, "y": 715, "name": "Chad", "type": "property", "subtype": "property", "cost": 120, "rent": [8, 40, 100, 300, 450, 600], "house_cost": 50, "color_set": 2},
    {"number": 10, "x": 5, "y": 715, "name": "Jail", "type": "jail", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 11, "x": 5, "y": 590, "name": "Scarborough", "type": "property", "subtype": "property", "cost": 140, "rent": [10, 50, 150, 450, 625, 750], "house_cost": 100, "color_set": 3},
    {"number": 12, "x": 5, "y": 532, "name": "Pepsi Company", "type": "property", "subtype": "company", "cost": 150, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": 9},
    {"number": 13, "x": 5, "y": 475, "name": "Markham", "type": "property", "subtype": "property", "cost": 140, "rent": [10, 50, 150, 450, 625, 750], "house_cost": 100, "color_set": 3},
    {"number": 14, "x": 5, "y": 417, "name": "Primary Campus", "type": "property", "subtype": "property", "cost": 160, "rent": [12, 60, 180, 500, 700, 900], "house_cost": 100, "color_set": 3},
    {"number": 15, "x": 5, "y": 359, "name": "Jeff Bus", "type": "property", "subtype": "bus", "cost": 200, "rent": [25, 50, 100, 200, 0, 0], "house_cost": 0, "color_set": 10},
    {"number": 16, "x": 5, "y": 302, "name": "GCP", "type": "property", "subtype": "property", "cost": 180, "rent": [14, 70, 200, 550, 750, 950], "house_cost": 100, "color_set": 4},
    {"number": 17, "x": 5, "y": 246, "name": "Baboon Bin", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 18, "x": 5, "y": 186, "name": "Mentor Lobby", "type": "property", "subtype": "property", "cost": 180, "rent": [14, 70, 200, 550, 750, 950], "house_cost": 100, "color_set": 4},
    {"number": 19, "x": 5, "y": 129, "name": "Bhav Barn", "type": "property", "subtype": "property", "cost": 200, "rent": [16, 80, 220, 600, 800, 1000], "house_cost": 100, "color_set": 4},
    {"number": 20, "x": 5, "y": 5, "name": "Lunch Break", "type": "lunch", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 21, "x": 136, "y": 5, "name": "Mentor Gym", "type": "property", "subtype": "property", "cost": 220, "rent": [18, 90, 250, 700, 875, 1050], "house_cost": 150, "color_set": 5},
    {"number": 22, "x": 192, "y": 5, "name": "Healthcare Hazard", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 23, "x": 250, "y": 5, "name": "North Korea", "type": "property", "subtype": "property", "cost": 220, "rent": [18, 90, 250, 700, 875, 1050], "house_cost": 150, "color_set": 5},
    {"number": 24, "x": 308, "y": 5, "name": "Mentor Office", "type": "property", "subtype": "property", "cost": 240, "rent": [20, 100, 300, 750, 925, 1100], "house_cost": 150, "color_set": 5},
    {"number": 25, "x": 365, "y": 5, "name": "Smith Bus", "type": "property", "subtype": "bus", "cost": 200, "rent": [25, 50, 100, 200, 0, 0], "house_cost": 0, "color_set": 10},
    {"number": 26, "x": 423, "y": 5, "name": "Yehia Pyramid", "type": "property", "subtype": "property", "cost": 260, "rent": [22, 110, 330, 800, 975, 1150], "house_cost": 150, "color_set": 6},
    {"number": 27, "x": 481, "y": 5, "name": "Egypt", "type": "property", "subtype": "property", "cost": 260, "rent": [22, 110, 330, 800, 975, 1150], "house_cost": 150, "color_set": 6},
    {"number": 28, "x": 538, "y": 5, "name": "Coca Cola Company", "type": "property", "subtype": "company", "cost": 150, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": 9},
    {"number": 29, "x": 595, "y": 5, "name": "Land Down Under", "type": "property", "subtype": "property", "cost": 280, "rent": [24, 120, 360, 850, 1025, 1200], "house_cost": 150, "color_set": 6},
    {"number": 30, "x": 710, "y": 5, "name": "Go To Brampton", "type": "gotojail", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 31, "x": 710, "y": 132, "name": "Evan Camp", "type": "property", "subtype": "property", "cost": 300, "rent": [26, 130, 390, 900, 1100, 1275], "house_cost": 200, "color_set": 7},
    {"number": 32, "x": 710, "y": 189, "name": "Greenland Park", "type": "property", "subtype": "property", "cost": 300, "rent": [26, 130, 390, 900, 1100, 1275], "house_cost": 200, "color_set": 7},
    {"number": 33, "x": 710, "y": 246, "name": "Baboon Bin", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 34, "x": 710, "y": 304, "name": "Oakville", "type": "property", "subtype": "property", "cost": 320, "rent": [28, 150, 450, 1000, 1200, 1400], "house_cost": 200, "color_set": 7},
    {"number": 35, "x": 710, "y": 362, "name": "Dan Bus", "type": "property", "subtype": "bus", "cost": 200, "rent": [25, 50, 100, 200, 0, 0], "house_cost": 0, "color_set": 10},
    {"number": 36, "x": 710, "y": 422, "name": "Healthcare Hazard", "type": "chest", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 37, "x": 710, "y": 478, "name": "Crystal Cove", "type": "property", "subtype": "property", "cost": 350, "rent": [35, 175, 500, 1100, 1300, 1500], "house_cost": 200, "color_set": 8},
    {"number": 38, "x": 710, "y": 534, "name": "Field Trip 100", "type": "tax", "subtype": None, "cost": 0, "rent": [0, 0, 0, 0, 0, 0], "house_cost": 0, "color_set": None},
    {"number": 39, "x": 710, "y": 593, "name": "Jungle of the Monkeys", "type": "property", "subtype": "property", "cost": 400, "rent": [50, 200, 600, 1400, 1700, 2000], "house_cost": 200, "color_set": 8},
]

CHEST_CARDS = [
    {"text": "You were late coming in from lunch\n go to the office", "move_to": 24, "money": 0},
    {"text": "You went to Brampton and were shot\n and mugged a $100. You were then taken\n to a hospital and were charged $200\n for treatment, then sent back to Brampton", "move_to": 30, "money": -300},
    {"text": "Advance to Smith class to get double the normal cokes", "move_to": 0, "money": 0},
    {"text": "Monkey fees, lose 50 cokes", "move_to": None, "money": -50},
    {"text": "Brayden needs your muck\n lose 25 cokes", "move_to": None, "money": -25},
    {"text": "You hate yourself\n go to Scarborough", "move_to": 11, "money": 0},
    {"text": "You decided you were tired of cokes\n go to the Pepsi company", "move_to": 12, "money": 0},
    {"text": "You completed an assignment on time\n receive 50 cokes", "move_to": None, "money": 50},
    {"text": "Bhavjeet wants you to be his Hartag\n he gave you 200 cokes for it", "move_to": None, "money": 200},
    {"text": "Smith deemed you king of the monkeys\n Receive 100 cokes", "move_to": None, "money": 100},
    {"text": "Take a trip on Bus Wayne", "move_to": 5, "money": 0},
    {"text": "You a ugly ah monkey and won\n second last in a beauty contest\n collect 10 cokes", "move_to": None, "money": 10},
    {"text": "Some monkey robbed a class\n and dropped the cokes\n collect 150 cokes", "move_to": None, "money": 150},
    {"text": "You brought your coke into class\n and Mcrae took it\n lose 100 cokes", "move_to": None, "money": -100},
]

# Lobby / UI default when no custom name is given (seat index → label).
PLAYER_DEFAULT_NAMES = ["Blue monkey", "Green monkey", "Red monkey", "Pink monkey"]

PLAYER_COLORS = [
    {"number": 0, "color": "blue", "color2": "midnightblue", "color3": "lightsteelblue", "is_human": True, "token_image": "monkeyfaceblue4.png", "money_image": "monkeymoneycokeb.png"},
    {"number": 1, "color": "lime", "color2": "darkgreen", "color3": "lightgreen", "is_human": False, "token_image": "newmongreen.png", "money_image": "monkeymoneyg4.png"},
    {"number": 2, "color": "red", "color2": "darkred", "color3": "lightcoral", "is_human": False, "token_image": "newmonred.png", "money_image": "monkeymoneyr4.png"},
    {"number": 3, "color": "fuchsia", "color2": "purple", "color3": "plum", "is_human": False, "token_image": "newmonpink.png", "money_image": "monkeymoneyp4.png"},
]

STARTING_MONEY = 1500
NUM_PLAYERS = 4
BOARD_SIZE = 40

# Initial worth_dict for AI valuation (same for all players)
INITIAL_WORTH_DICT = {
    1: 6, 3: 6, 6: 10, 8: 10, 9: 12,
    11: 14, 13: 14, 14: 16, 16: 18, 18: 18, 19: 20,
    21: 22, 23: 22, 24: 24, 26: 26, 27: 26, 29: 28,
    31: 30, 32: 30, 34: 32, 37: 35, 39: 40,
    12: 15, 28: 15,
    5: 20, 15: 20, 25: 20, 35: 20,
}

# Purchasable space numbers (properties, buses, companies)
PURCHASABLE_SPACES = [1, 3, 5, 6, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19,
                      21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 34, 35, 37, 39]

# Chest space numbers: "Baboon Bin" and "Healthcare Hazard"
BABOON_BIN_SPACES = [2, 17, 33]
HEALTHCARE_HAZARD_SPACES = [7, 22, 36]

BUS_SPACES = [5, 15, 25, 35]
COMPANY_SPACES = [12, 28]
TAX_SPACES = {4: 200, 38: 100}

# Two-property color sets (for set completion logic)
TWO_PROPERTY_SETS = [1, 8]
