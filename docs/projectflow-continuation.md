# ProjectFlow continuation

When continuing a project in a new DSH session, first call agent_project_status or agent_project_report. These tools read the durable ProjectFlow state and the live execution-link projection, so the next session can distinguish implemented-but-not-accepted work, missing teams, missing task IDs, and blocked execution.

An execution link is valid only when the linked team exists, is bound to the same project, and contains every task ID recorded on the Work Item. A team that exists while one or more recorded task IDs are missing is reported as link_status: link_invalid with projected_status: blocked; repairing that condition requires creating or migrating the missing tasks and is outside a teamId-only link repair.

ProjectFlow does not detect DSH context limits, create replacement DSH sessions, or perform automatic session handoff. Those concerns remain outside the plugin boundary.

The project overview now presents one plain-language next step and a copy continuation message. The copied message is read-only: it asks a new conversation to summarize the previous work before changing anything. Users should continue one piece of work in one conversation; the plugin does not silently merge parallel conversations.
