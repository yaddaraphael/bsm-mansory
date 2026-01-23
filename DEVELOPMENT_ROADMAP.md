# BSM Development Roadmap

## Phase 1: Core UI Implementation (Weeks 1-2)

### 1.1 Authentication & User Management
- [ ] **Complete Login/Logout Flow**
  - Add "Remember Me" functionality
  - Add password reset flow
  - Add session timeout handling
  - Improve error messages

- [ ] **User Profile Page**
  - Display user information
  - Allow profile picture upload
  - Edit phone, city, location
  - View invitation history
  - View permission change log

- [ ] **User Invitation Interface**
  - Create invitation form (Admin/HR only)
  - Role and scope selection
  - Send invitation email (if email backend configured)
  - View pending invitations

- [ ] **User Management Dashboard**
  - List all users with filters
  - Search functionality
  - View user details
  - Edit user roles/scopes (with audit logging)
  - Activate/deactivate users
  - View "who invited who" chain

### 1.2 Project Management UI
- [ ] **Projects List Page**
  - Display all projects with status badges
  - Filter by branch, status, PM
  - Search by job number/name
  - Green/Yellow/Red status indicators
  - Quick actions (view, edit, assign)

- [ ] **Project Detail Page**
  - Project overview card
  - Schedule status with forecast date
  - Production % vs Financial %
  - Scopes of work list
  - Daily reports timeline
  - Equipment assigned
  - Team members assigned
  - AI status summary (when implemented)

- [ ] **Create/Edit Project Form**
  - All required fields
  - Scope of work multi-select
  - Schedule calculator preview
  - Auto job number generation
  - Assign PM, Super, GC

- [ ] **Project Dashboard (PM View)**
  - My projects list
  - Status overview
  - Upcoming deadlines
  - Action items

### 1.3 Branch Management
- [ ] **Branches List Page**
  - Display all branches
  - Map view (optional)
  - Branch statistics
  - Create/Edit branch form

## Phase 2: Time Tracking UI (Weeks 2-3)

### 2.1 Worker Time Tracking
- [ ] **Clock In/Out Interface (Mobile-First)**
  - Current project selection (only allowed projects)
  - Clock in button with location capture
  - Active clock-in display
  - Clock out button
  - Break tracking
  - Cost code selection (if applicable)

- [ ] **My Time Dashboard**
  - Today's hours
  - Week summary (regular/OT)
  - Month summary
  - Project breakdown
  - Time entry history
  - Status indicators (Draft/Submitted/Approved)

- [ ] **Time Correction Request**
  - Request form
  - View pending requests
  - Status tracking

### 2.2 Foreman Time Management
- [ ] **Crew Time Entry**
  - View assigned workers
  - Confirm attendance
  - Clock crew in/out (if enabled)
  - View crew time summary

- [ ] **Daily Report Submission**
  - Integrated with time tracking
  - Crew counts
  - Installed quantities per scope
  - Notes and photo upload
  - Blockers/delays selection
  - Submit for approval

### 2.3 Supervisor/HR Time Approval
- [ ] **Time Approval Queue**
  - Pending time entries list
  - Filter by project, date, employee
  - Approve/Reject actions
  - Bulk approval
  - Exception handling

- [ ] **Time Exceptions Dashboard**
  - Missing punches
  - Duplicate entries
  - Long shifts
  - Unusual patterns
  - Resolution workflow

- [ ] **Pay Period Management**
  - View pay periods
  - Lock/unlock periods
  - Payroll summary export

## Phase 3: Equipment Management UI (Week 3-4)

### 3.1 Equipment Registry
- [ ] **Equipment List**
  - All equipment with status
  - Filter by type, status, location
  - Search by asset number
  - Current site assignment

- [ ] **Equipment Detail Page**
  - Equipment information
  - Assignment history
  - Transfer history
  - Billing cycle information
  - Maintenance notes

- [ ] **Add/Edit Equipment Form**
  - All equipment fields
  - Billing date and cycle
  - Status management

### 3.2 Equipment Assignment
- [ ] **Assign Equipment to Project**
  - Project selection
  - Foreman assignment
  - Assignment date
  - Notes

- [ ] **Equipment Transfer Workflow**
  - Initiate transfer (sending foreman)
  - Select equipment
  - Choose destination (project/branch)
  - Select receiving foreman
  - Add condition notes
  - Transfer confirmation

- [ ] **Transfer Approval Interface**
  - Pending transfers list
  - Accept/Reject actions
  - Receipt confirmation
  - Transfer history

### 3.3 Equipment Dashboard
- [ ] **Equipment on Ground View**
  - By project
  - By branch
  - Equipment categories
  - Status overview

## Phase 4: Daily Reports & Checklists (Week 4-5)

### 4.1 Daily Reports
- [ ] **Daily Report List**
  - Filter by project, date, status
  - View submitted reports
  - Status badges

- [ ] **Daily Report Detail View**
  - Full report information
  - Photos gallery
  - Installed quantities breakdown
  - Notes and blockers
  - Approval workflow

- [ ] **Daily Report Submission Form**
  - Date selection
  - Crew counts
  - Installed quantities (per scope)
  - Photo upload
  - Notes textarea
  - Blockers selection
  - Save draft / Submit

### 4.2 Weekly Checklists
- [ ] **Weekly Checklist List**
  - Filter by project, week
  - Status indicators
  - Completion status

- [ ] **Weekly Checklist Form**
  - Tuesday date selection
  - Checkboxes (handoffs, safety plan)
  - Weekly notes
  - Draft/Submit workflow
  - Approval chain (Super → PM)

## Phase 5: Dashboards & Reporting (Week 5-6)

### 5.1 Role-Specific Dashboards
- [ ] **Admin Dashboard**
  - System overview
  - All projects status
  - Active users
  - Equipment overview
  - Recent activity

- [ ] **PM Dashboard**
  - My projects list
  - Status summary (Green/Yellow/Red)
  - Upcoming deadlines
  - AI weekly reviews
  - Action items

- [ ] **Superintendent Dashboard**
  - Assigned projects
  - Pending approvals
  - Daily reports queue
  - Time approval queue
  - Site activity summary

- [ ] **Finance Dashboard**
  - Project cost overview
  - Financial % vs Production %
  - Variance analysis
  - Contract values
  - Forecast margins

- [ ] **HR Dashboard**
  - Active employees
  - Time exceptions
  - Pay period status
  - Pending invitations
  - Compliance overview

- [ ] **Foreman Dashboard**
  - My projects
  - Today's tasks
  - Crew status
  - Equipment on site
  - Pending approvals

- [ ] **Worker Dashboard**
  - Clock in/out
  - Today's hours
  - Week summary
  - Assigned projects

### 5.2 Reports & Exports
- [ ] **Project Reports**
  - Progress report (PDF)
  - Weekly status report
  - Export to CSV
  - Custom date ranges

- [ ] **Time Reports**
  - Employee timesheet (PDF)
  - Project hours summary
  - Payroll export
  - Overtime analysis

- [ ] **Equipment Reports**
  - Equipment utilization
  - Transfer history
  - Billing cycle report

## Phase 6: Advanced Features (Week 6-8)

### 6.1 AI Integration Points
- [ ] **AI Status Reason Engine**
  - Display Green/Yellow/Red reasons
  - Top 3-5 delay drivers
  - Evidence signals
  - Suggested actions

- [ ] **AI Weekly Review**
  - Generate weekly summaries
  - Progress analysis
  - Risk identification
  - Recommendations

- [ ] **AI Anomaly Detection**
  - Productivity drops
  - Missing data flags
  - Unusual patterns
  - Alert system

### 6.2 Public Portal
- [ ] **Public View (No Login)**
  - Public link access
  - Optional PIN protection
  - Published projects list
  - Project status cards
  - % complete indicators
  - Green/Yellow/Red status
  - Workers/Equipment counts
  - Shareable photos
  - Last updated timestamp

### 6.3 GC User Views
- [ ] **GC Dashboard**
  - Assigned projects
  - Project status overview
  - Progress indicators
  - Weekly snapshots
  - Shareable photos
  - AI summary (sanitized)
  - Download reports (PDF)

### 6.4 Audit & Compliance
- [ ] **Audit Log Viewer**
  - Filter by user, action, date
  - Search functionality
  - Export audit logs
  - Permission change history

- [ ] **Compliance Reports**
  - Who invited who report
  - Permission change log
  - Equipment transfer history
  - Time edit history

## Phase 7: Mobile Optimization (Week 8-9)

### 7.1 Mobile-First Features
- [ ] **Responsive Design**
  - Mobile navigation
  - Touch-friendly buttons
  - Optimized forms
  - Mobile dashboard layouts

- [ ] **Mobile Time Tracking**
  - Quick clock in/out
  - Location capture
  - Photo upload from camera
  - Offline capability (optional)

- [ ] **Mobile Daily Reports**
  - Simplified form
  - Camera integration
  - Voice notes (optional)
  - Quick submission

## Phase 8: Integrations & Enhancements (Week 9-10)

### 8.1 External Integrations
- [ ] **Traqspera Integration**
  - Equipment sync
  - Billing integration

- [ ] **SharePoint Integration**
  - Document storage
  - Photo storage
  - Report storage

### 8.2 Notifications
- [ ] **Email Notifications**
  - User invitations
  - Approval requests
  - Transfer requests
  - Status changes
  - Weekly summaries

- [ ] **In-App Notifications**
  - Notification center
  - Real-time updates
  - Badge counts

### 8.3 File Management
- [ ] **Photo Upload**
  - Daily report photos
  - Equipment photos
  - Profile pictures
  - Storage integration (S3/local)

- [ ] **Document Management**
  - Attach documents to projects
  - Safety plans
  - Training certificates
  - Reports storage

## Phase 9: Testing & Refinement (Week 10-11)

### 9.1 Testing
- [ ] **Unit Tests**
  - Backend model tests
  - API endpoint tests
  - Utility function tests

- [ ] **Integration Tests**
  - User workflows
  - Approval chains
  - Transfer workflows

- [ ] **E2E Tests**
  - Critical user paths
  - Role-based access
  - Data integrity

### 9.2 Performance Optimization
- [ ] **Backend Optimization**
  - Database query optimization
  - Caching strategy
  - API response optimization

- [ ] **Frontend Optimization**
  - Code splitting
  - Image optimization
  - Lazy loading
  - Bundle size optimization

### 9.3 Security Hardening
- [ ] **Security Audit**
  - Input validation
  - SQL injection prevention
  - XSS prevention
  - CSRF protection
  - Authentication security
  - Permission checks

## Phase 10: Production Readiness (Week 11-12)

### 10.1 Deployment Preparation
- [ ] **Environment Configuration**
  - Production settings
  - Environment variables
  - Database migration strategy
  - Static file serving

- [ ] **CI/CD Pipeline**
  - Automated testing
  - Deployment automation
  - Rollback strategy

- [ ] **Monitoring & Logging**
  - Error tracking (Sentry)
  - Performance monitoring
  - User activity logging
  - System health checks

### 10.2 Documentation
- [ ] **User Documentation**
  - User guides per role
  - Video tutorials
  - FAQ section

- [ ] **Technical Documentation**
  - API documentation
  - Architecture diagrams
  - Deployment guide
  - Troubleshooting guide

### 10.3 Training & Support
- [ ] **Training Materials**
  - Admin training
  - User training
  - Role-specific guides

- [ ] **Support System**
  - Help desk integration
  - Support ticket system
  - Knowledge base

## Priority Recommendations

### Must Have (MVP)
1. ✅ Authentication & Login
2. ✅ User Management (invite, view, edit)
3. ✅ Project List & Detail pages
4. ✅ Time Tracking (clock in/out)
5. ✅ Daily Reports (submit & approve)
6. ✅ Basic Dashboards per role

### Should Have (Phase 1)
1. Equipment Management UI
2. Weekly Checklists
3. Time Approval Workflow
4. Equipment Transfers
5. Reports & Exports

### Nice to Have (Phase 2+)
1. AI Integration
2. Public Portal
3. GC Views
4. Mobile Optimization
5. External Integrations

## Development Tips

1. **Start with Core User Flows**
   - Worker clock in/out
   - Foreman daily report
   - PM project view
   - Admin user management

2. **Build Reusable Components**
   - Status badges (Green/Yellow/Red)
   - Data tables with filters
   - Form components
   - Modal dialogs

3. **Focus on Mobile-First**
   - Many users will be on mobile
   - Prioritize mobile UX
   - Test on real devices

4. **Iterate Based on Feedback**
   - Get user feedback early
   - Adjust based on actual usage
   - Prioritize pain points

5. **Keep Security in Mind**
   - Always check permissions
   - Validate all inputs
   - Log important actions
   - Test role-based access

## Next Immediate Steps

1. **Start with Authentication UI** (if not complete)
   - Polish login page
   - Add logout functionality
   - Handle token refresh

2. **Build Project List Page**
   - Display projects
   - Add filters
   - Status badges
   - Navigation to detail

3. **Create Project Detail Page**
   - Show all project info
   - Schedule status
   - Scopes list
   - Team members

4. **Implement Time Tracking UI**
   - Clock in/out interface
   - My time dashboard
   - Time entry list

5. **Build Daily Report Form**
   - Submission form
   - Photo upload
   - Approval workflow

Choose based on your priorities and user needs!

