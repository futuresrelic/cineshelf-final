<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CineShelf - Column Migration</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 10px;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            border-left: 4px solid #4CAF50;
        }
        .success {
            color: #4CAF50;
            font-weight: bold;
        }
        .error {
            color: #f44336;
            font-weight: bold;
        }
        .info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            border-left: 4px solid #2196F3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>CineShelf Database Migration</h1>
        <div class="info">
            <strong>What this does:</strong>
            <p>This migration adds missing columns to the movies table that are required for the app to function properly:</p>
            <ul>
                <li><code>display_title</code> - Custom title override</li>
                <li><code>certification</code> - Movie rating (G, PG, PG-13, R, etc.)</li>
                <li><code>media_type</code> - Media type (movie/tv)</li>
            </ul>
        </div>

        <h2>Migration Output:</h2>
        <pre><?php
require_once __DIR__ . '/migrate_missing_columns.php';
        ?></pre>

        <div class="info">
            <strong>Next steps:</strong>
            <p>If the migration was successful, you can now refresh your CineShelf app and it should work properly!</p>
        </div>
    </div>
</body>
</html>
