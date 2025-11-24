CODING AXIOMS README
======================

These are the definitive coding axioms for your Godot 4 project and ChatGPT’s behavior when generating scripts.

1. NO TERNARY EXPRESSIONS
   - Never use JavaScript/Python/GDScript ternary operators.
   - Never use “a if cond else b”.
   - Never use “?:” shorthand.
   - All logic must use explicit if/elif/else blocks with detailed indentation, tabs over single spaces.

2. GODOT 4 SYNTAX RULES
   - Use @onready (NOT old Godot 3 syntax).
   - Avoid deprecated API.
   - rect_position → position
   - Use explicit integer casts for alignment:
       horizontal_alignment = 1 as HorizontalAlignment
   - Avoid Godot 3 properties such as rect_min_size.

3. UI & POPUPS
   - Don’t assign custom_minimum_size on PopupPanel unless appropriate.
   - To display popups: create → add → popup_centered().
   - To remove: queue_free().
   - Never use nonexistent APIs like set_custom_minimum_size().
   - Avoid popups whenever possible.

4. MANAGER ARCHITECTURE
   - Each manager in its own file:
       RunManager
       CombatManager
       PuzzleRoot
       HappeningManager
   - NEVER merge managers into one script.
   - Managers must not shadow variables—do NOT redeclare a top‑level variable inside functions.

5. DEFENSIVE PROGRAMMING
   - Always check references before using them:
       if not runmgr or not runmgr.RUN: return
   - Always use get_node_or_null() instead of get_node().
   - Never assume nodes exist — validate them. Suggest their creation, if need be.

6. GODOT 4 FOCUS SYSTEM
   - To allow focus:
       control.set_focus_mode(2 as FocusMode)
       control.set_focus_behavior_recursive(1 as Control.FocusBehaviorRecursive)
   - Never call grab_focus() on a control that cannot be focused.
   - Focus systems are common when they are involved. Keep these systems simple or avoid them if possible.

7. CODE CLEANLINESS RULES
   - Never use ternaries (repeated for safety).
   - No JS‑style operators.
   - Use typed variables when helpful:
       var hero : Dictionary = ...
   - No shadowing of top-level variables.

8. “REMEMBER THIS” POLICY
   - If the user says “remember this”, “from now on”, or similar, this becomes a permanent coding preference unless stated otherwise. This should always be treated as a top priority.

9. GODOT 4 LAYOUT & NODE USE
   - Don’t use rect_min_size in Godot 4 scripts.
   - Layout should be configured in the editor unless explicitly needed.
   - Avoid runtime assignment to deprecated rect_ properties.

10. FILE STRUCTURE & SCENE RELATIONS
   - Root nodes must match naming conventions:
       CombatRoot, PuzzleRoot, HappeningRoot, LobbyRoot
   - Scenes must always align to their scripted managers.

END OF FILE
