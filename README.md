# reVisionary
School Revision Scheduler & Register System

An automated Google Apps Script (GAS) system designed to manage school revision sessions, student sign-ups via Google Forms, clash detection, and automated PDF register delivery.

🚀 Features

Dynamic Form Sync: Rebuilds Google Forms daily based on a "sessions" spreadsheet.

British Date Parsing: Robust handling of dd/MM/yyyy date formats.

Clash Detection: Automatically notifies students via HTML email if they select overlapping sessions.

Automated Registers: Generates PDF attendance lists for teachers and emails them at a scheduled time.

Security Whitelist: Restricts administrative and testing functions to authorized staff emails.

Performance Optimized: Uses batch spreadsheet operations and O(1) lookup maps to handle high-volume sign-ups.

📂 File Structure

0_Config.gs: Global constants, Form IDs, and the authorized user whitelist.

SyncEngine.gs: The core engine that populates Google Forms from the spreadsheet.

AdminUtils.gs: Handles form submissions, booking logs, and clash detection logic.

Registers.gs: Logic for generating and emailing PDF registers to staff.

Helpers.gs: Utility functions for date parsing and string extraction.

Tests.gs: A robust testing suite to verify system logic without affecting live data.

RegisterTemplate.html: The CSS/HTML template used for PDF register generation.

🛠️ Setup

Spreadsheet: Create a sheet with a sessions tab (Header on Row 3).

Forms: Create Year 11 and Year 13 Forms with email collection enabled.

Apps Script: Copy the .gs and .html files into the script editor attached to your sheet.

Configuration: Update 0_Config.gs with your specific Form IDs and authorized staff emails.

Initialization: Run setupSystemTriggers() from 0_Config.gs to install the daily timers.

🧪 Testing

Run runSystemTests() from the Tests.gs file to ensure the environment is configured correctly. For a safe preview of pending changes, use dryRunSync().

📜 License

This project is designed for educational use. Feel free to adapt it for your school's specific requirements.
