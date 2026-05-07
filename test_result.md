#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  River-focused GPS app (white-water + calmer trips) with USGS flow data, USA-only,
  using OpenStreetMap. Latest round: rebrand to "RiverRight", replace Gauges tab with
  a Map tab showing USA rivers highlighted in blue, fix squished Rivers filter buttons,
  add POIs to river descriptions, fix "Could not load gauge data" 404 on river runs.

backend:
  - task: "Fix Ocoee USGS site id (404 → 200)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Replaced inactive 03566425 with active 03559500 (OCOEE RIVER AT COPPERHILL, TN). Verified via curl: returns cfs=848 status=Runnable."

  - task: "Featured rivers POIs"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "All 8 featured rivers carry points_of_interest arrays with named rapids/eddies and run notes."

  - task: "API rebrand (RiverRight)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Root /api/ now returns RiverRight."

frontend:
  - task: "Replace Gauges tab with Map tab (USA rivers in blue)"
    implemented: true
    working: true
    file: "frontend/app/map.tsx, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "New Map tab uses CartoDB Voyager basemap + USGS National Map hydrography overlay. Markers for all featured rivers colored by type (whitewater/mixed/calm). Popup CTA navigates to river detail. Legend + bottom stats. Old gauges.tsx removed from /app."

  - task: "Polish Rivers filter buttons"
    implemented: true
    working: true
    file: "frontend/app/rivers.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Increased horizontal padding 18→22, vertical 11→12, minHeight 44→46, added minWidth 88. Buttons no longer squished."

  - task: "Rebrand to RiverRight"
    implemented: true
    working: true
    file: "frontend/app.json, frontend/app/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "app.json name/slug → RiverRight/riverright. Home overline RIVERRUNNER → RIVERRIGHT, headline 'Run it well' → 'Run it right'."

  - task: "POI rendering on river detail"
    implemented: true
    working: true
    file: "frontend/app/river/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "river/[id].tsx renders points_of_interest as a bulleted list above Hazards. Verified via screenshot — Colorado Grand Canyon shows Soap Creek, Hance, Crystal, Lava Falls, Diamond Peak."

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Fix Ocoee USGS site id (404 → 200)"
    - "Replace Gauges tab with Map tab (USA rivers in blue)"
    - "Polish Rivers filter buttons"
    - "Rebrand to RiverRight"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Round 2 of feedback applied: rebrand to RiverRight, Gauges→Map tab with USA hydrography overlay
      and per-river markers, fixed Ocoee USGS 404 (03566425 → 03559500), polished filter button padding,
      verified POIs render on river detail. Ran curl + screenshot smoke checks. All 8 featured rivers
      now return live USGS flow data. Awaiting user verification before further enhancements.
