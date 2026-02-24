<!DOCTYPE html>
<html>
<head>
  <style>
    @page { margin: 0.5cm; }
    body { font-family: Arial, sans-serif; padding: 10px; color: #333; margin: 0; }
    
    .header { 
      border-bottom: 2px solid #2c3e50; 
      padding-bottom: 5px; 
      margin-bottom: 10px; 
    }
    h2 { margin: 0; color: #2c3e50; font-size: 18px; text-transform: uppercase; }
    .meta { font-size: 11px; margin-top: 3px; color: #444; }
    
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { 
      border: 1px solid #777; 
      padding: 3px 6px; /* High density for A4 optimization */
      text-align: left; 
      font-size: 10.5px; 
      line-height: 1.1;
    }
    th { 
      background-color: #f0f0f0; 
      font-weight: bold; 
      color: #2c3e50; 
      border-bottom: 2px solid #777;
      font-size: 11px;
    }
    
    /* Column Widths */
    .col-name { width: 45%; }
    .col-unpaid { width: 15%; text-align: center; }
    .col-clash { width: 10%; text-align: center; }
    .col-attendance { width: 30%; }

    .cell-name { font-weight: bold; font-size: 11.5px; }
    .cell-unpaid { text-align: center; color: #b71c1c; font-weight: bold; font-size: 9px; }
    .cell-clash { text-align: center; color: #e65100; font-size: 14px; }
    .cell-attendance { height: 18px; } /* Compact row height */
    
    .footer { 
      margin-top: 10px; 
      font-size: 9px; 
      color: #888; 
      text-align: left; 
      border-top: 1px solid #eee; 
      padding-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>{{Subject}} - {{Teacher}}</h2>
    <div class="meta">
      <strong>Topic:</strong> {{Topic}} | 
      <strong>Room:</strong> {{Room}} | 
      <strong>Time:</strong> {{StartTime}} - {{EndTime}} | 
      <strong>Session Date:</strong> {{Date}}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-name">Student Name</th>
        <th class="col-unpaid">Unpaid Status</th>
        <th class="col-clash">Clash</th>
        <th class="col-attendance">Attendance Check</th>
      </tr>
    </thead>
    <tbody>
      {{AttendeeRows}}
    </tbody>
  </table>

  <div class="footer">
    CSG Assessment Revision System | PDF Produced on: {{ProductionDate}}
  </div>
</body>
</html>
