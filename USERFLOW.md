# USERFLOW

## Login

- Navigate to the login page.
- Enter email/username and password.
- Submit the form to authenticate.
- On success, the user is redirected to the dashboard.
- On failure, an error message is shown and the user remains on the login page.

## Fetch Projects (Project List)

- User opens the Projects page.
- The client requests the project list from the backend.
- The backend filters projects based on the user role and branch access.
- The UI renders the project table/list with status, branch, and key fields.

## View Project (Project Details)

- User selects a project from the list.
- The client requests project details by `job_number` (or project id).
- The backend returns project data and related Spectrum details (dates, phases, UDFs, contacts, cost projections when available).
- The UI renders the details view with tabs/sections (overview, phases, dates, contacts, etc.).

## Create Scopes for Projects

- User opens a project and selects the Scopes section.
- User clicks "Create Scope" and fills in scope fields.
- The client submits the scope payload to the backend.
- The backend validates, creates the scope, and associates it with the project.
- The UI refreshes the scope list and shows the newly created scope.

## Create Meeting

- User navigates to Meetings (global or within a project).
- User clicks "Create Meeting" and fills in meeting details (title, date/time, attendees, notes).
- The client submits the meeting payload to the backend.
- The backend validates, saves the meeting, and associates it to the project (if applicable).
- The UI refreshes the meeting list and shows the new meeting.

## View Projects for HQ

- User with HQ role opens the Projects page.
- The backend returns all projects or projects across all branches.
- The UI shows the full project list with branch grouping or branch filters.

## View Projects for Branches

- Branch user opens the Projects page.
- The backend restricts results to the user�s branch (or assigned branches).
- The UI shows only branch-visible projects and relevant metrics.

