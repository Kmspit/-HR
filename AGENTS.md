# HRFlow — Enterprise HR Platform

**Project Type**: Frontend HTML/CSS UI prototype for HR management system

## Project Overview

HRFlow is an enterprise HR management platform with features for employee tracking, attendance, payroll, leave management, and company communications. Currently in early-stage frontend development with HTML/CSS only.

### Key Features
- Dashboard with analytics
- Attendance & time tracking
- Leave request management
- Out-of-office scheduling
- Payroll & payslips
- Employee management
- Announcements & warnings
- Company rules & settings
- LINE OA integration

## Architecture & Structure

### Files & Responsibilities
- **index.html** — Main dashboard page; defines sidebar navigation structure and page layout
- **style.css** — Complete styling system using CSS custom properties (variables); includes responsive design, dark theme, and component styles

### Design System

**Color Variables** (defined in `:root`):
- Background: `--bg` (primary), `--bg2`, `--bg3`
- Accents: `--accent` (#3b82f6 blue), `--accent2` (#6366f1 indigo), `--accent3` (#06b6d4 cyan)
- Semantic: `--green`, `--red`, `--yellow`, `--orange`, `--purple`
- Text: `--text`, `--text2`, `--text3`
- Borders: `--border`, `--border2`
- Spacing: `--r` (12px), `--r2` (16px)

**Typography**:
- Primary: "Syne" (400, 700, 800 weights) — headings & branding
- Body: "Noto Sans Thai" (300-600 weights) — content & labels
- Language: Thai localization used throughout UI

**UI Patterns**:
- Sidebar navigation (fixed left, 240px width)
- Dark mode theme with subtle noise texture
- Navigation sections with labels and badges
- Responsive design with overlay for mobile

### CSS Organization
- CSS custom properties for theming (easy to maintain dark/light mode)
- Utility-style sections marked with `/* ── SECTION ── */` comments
- Modular component classes (`.sidebar`, `.nav-item`, `.card`, etc.)
- Flexbox & grid layouts

## Development Guidelines

### Adding New Pages
1. Create new HTML file (e.g., `attendance.html`)
2. Include same `<head>` structure with fonts and styles
3. Follow sidebar navigation pattern in markup
4. Reuse existing CSS classes from `style.css`

### Styling New Components
1. Use CSS custom properties from `:root` for colors/spacing
2. Keep component styles modular with BEM-like naming
3. Test dark theme compatibility
4. Maintain Thai font support (Noto Sans Thai)

### Localization Notes
- UI text is in Thai language
- Maintain UTF-8 encoding in HTML files
- Font stack prioritizes Noto Sans Thai for proper rendering

## Next Steps & Common Tasks

- **Adding interactivity**: Create JavaScript files for sidebar toggle, page navigation, form handling
- **Backend integration**: Plan API endpoints for employee data, attendance tracking, payroll
- **Data visualization**: Dashboard analytics will need charts (consider Chart.js or similar)
- **Mobile responsiveness**: Test overlay and sidebar on mobile devices

## Notes for AI Agents

- **Page references**: `index.html` contains links to other pages not yet created (attendance.html, leave.html, etc.)
- **Consistency**: Always use existing CSS variables and color scheme
- **Thai language**: If adding content, maintain Thai localization
- **Accessibility**: Ensure color contrasts meet WCAG standards with current dark theme
- **Scope**: Currently HTML/CSS only; coordinate with backend team before adding JavaScript
