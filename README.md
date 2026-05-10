# ⚔️ D&D 5e Combat Tracker

A free, mobile-friendly web app to manage D&D 5e combat encounters — no login, no install, no backend required. Just open it in your browser and play.

**Live version:** [williamwolf92.github.io/dnd-combat-tracker](https://williamwolf92.github.io/dnd-combat-tracker) *(update this link if needed)*

---

## ✨ Features

- **Initiative tracking** — add players and monsters, sort by initiative automatically
- **Bestiary autocomplete** — type a monster name and HP, AC and Initiative fill in automatically
- **HP management** — numpad with damage/heal, resistant/vulnerable modifiers, and low-HP pulse warning at ≤20%
- **Attack rolls** — roll against a target's AC with advantage/disadvantage; shows HIT, MISS or CRITICAL
- **Conditions** — apply and remove D&D 5e conditions (Stunned, Poisoned, etc.) per combatant
- **Concentration (Focus)** — auto-triggers a CON saving throw when a focused combatant takes damage
- **Death Saving Throws** — full rules support: Nat 1 = 2 failures, Nat 20 = instant revive, 3 successes = stabilize
- **Dice roller** — standalone panel for any dice expression (`#d#`, `#d#±#`) with advantage/disadvantage
- **Combat history** — filterable event log for the whole session
- **Export / Import** — save and restore complete combat state as a JSON file

---

## 🚀 Getting Started

No build step required. Clone the repo and open `index.html` in your browser:

```bash
git clone https://github.com/williamwolf92/dnd-combat-tracker.git
cd dnd-combat-tracker
# Open index.html in your browser
```

Or simply visit the live version linked above.

---

## 🧭 How to Use

### Adding combatants
Go to the ⚔️ **Combat** tab and tap **✦ Add**. Enter a name — if it's a monster, select it from the suggestions and Initiative, HP and AC will fill in automatically.

- **Initiative** accepts a fixed number (`14`) or a DEX modifier (`+3`, `-2`) — the app rolls and adds it.
- **HP** accepts a fixed number, a roll (`2d8`) or a roll with bonus (`2d8+3`).
- **AC** accepts a fixed number only.

### Modifying HP
Tap the ❤️ HP value on a card. Use the numpad to enter a value, then tap **Damage** or **Heal**. Use **Resistant** to halve damage (e.g. on a successful save) or **Vulnerable** to double it.

### Attack rolls
Tap the 🛡 AC value on a card. Set the attack bonus and roll type, then tap **⚔️ Attack** to see the result.

### Conditions
Tap **Cond.** on any card to add conditions. Tap a condition chip to remove it.

### Concentration
Tap the **Focus** chip to toggle concentration. When a focused combatant takes damage, a save panel opens automatically.

### Death Saving Throws
When a combatant reaches 0 HP they fall unconscious. On their turn, tap the ❤️ HP to open the Death Save panel and roll.

### Export / Import
Use the 💾 and 📂 buttons in the Combat header to save or load a full combat state. **Warning:** importing replaces all current data.

---

## 🗂️ Project Structure

```
dnd-combat-tracker/
├── index.html                # App structure and all modals
├── script.js                 # All game logic
├── style.css                 # Styles and layout
├── bestiary_stats/           # Monster stat data files
├── bestiary-stats_index.txt  # Bestiary source data
└── add_monsters_index.txt    # Additional monster entries
```

---

## 🛠️ Tech Stack

- **HTML / CSS / JavaScript** — vanilla, no frameworks or dependencies
- **Mobile-first** — designed for phone use at the table

---

## 📄 License

This project is open source. Feel free to fork and adapt it for your own campaigns.
