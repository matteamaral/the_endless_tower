Game Overview for AI Processing

This document summarizes the core structure, gameplay flow, and design expectations of the project, intended for an AI system to understand the major components and how they interact.

High-Level Concept
The game is a run-based RPG dungeon crawler with three primary room types:
- Combat Rooms — turn-based battles using a speed-ordered action queue.
- Puzzle Rooms — simple obstacles that hide the combat UI and require a quick resolution.
- Happening Rooms — narrative micro-events that offer choices, boons, healing, or information.

Runs are short and repeatable. Upon death, players are sent to a Lobby Scene where they can start a new run and track how many runs they've completed.

Room Handling
The RunManager determines which room type is entered.  
Each room type has its own manager script:
- CombatManager
- PuzzleRoot / PuzzleManager
- HappeningManager

Only one manager should be visible and active at a time.  
The UI must hide whichever systems do not correspond to the current room.

UI Layering
- Combat UI shows only in combat.
- Puzzle UI fully covers combat.
- Happening UI fully covers both combat and puzzle.
- Lobby UI is a separate scene.

Puzzle and Happening are “sister” systems:
- Both are Controls overlaying the main root.
- Both hide themselves when inactive.
- Both re-enable input and visibility when entered.

Player Death
- Hero reaches 0 HP → run ends immediately.
- MainUI signals CombatManager to switch scenes.
- Lobby scene loads.
- Run counter increments inside the LobbyManager.

Focus & Input Rules
- No ternary expressions.
- No deprecated APIs.
- set_focus_mode(2 as FocusMode) for interactables.
- set_focus_behavior_recursive(1 as Control.FocusBehaviorRecursive) for containers.
- grab_focus() only on valid focusable Controls.

Code Style Rules (For AI)
- GDScript 2.0 only.
- Avoid all ternaries.
- Avoid deprecated layout APIs.
- Use get_node_or_null().
- Use @onready only on Node-derived classes.
- Avoid variable shadowing.
- Managers must be separated.
- All node lookups must be defensive.

Summary
This game is a structured node-based run system with layered UI modules, a turn-based combat loop, and strict coding rules to maintain stability. The AI should follow these constraints when generating or modifying code.
