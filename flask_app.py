import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Database connection with SQLAlchemy
def get_db_engine():
    database_url = os.getenv('DATABASE_URL')
    
    # Handle potential Heroku database URL format
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    return create_engine(database_url, connect_args={"sslmode": "require"})

@app.route('/', methods=['GET'])
def home():
    return jsonify({"status": "ML service is alive"})

@app.route('/predict', methods=['GET'])
def predict_sales():
    try:
        # Get parameters
        months_ahead = int(request.args.get('months_ahead', 1))
        
        if months_ahead < 1 or months_ahead > 12:
            return jsonify({"error": "months_ahead must be between 1 and 12"}), 400
        
        # Get data from database using SQLAlchemy
        engine = get_db_engine()
        query = text("""
            SELECT 
                EXTRACT(YEAR FROM date) as year,
                EXTRACT(MONTH FROM date) as month,
                SUM(actualsales) as total_sales
            FROM sales
            GROUP BY year, month
            ORDER BY year, month
        """)
        
        # Execute query and load into DataFrame
        with engine.connect() as connection:
            df = pd.read_sql_query(query, connection)
        
        if len(df) < 6:  # Need at least 6 months of data
            return jsonify({"error": "Not enough data for prediction"}), 400
        
        # Feature engineering
        df['year'] = df['year'].astype(int)
        df['month'] = df['month'].astype(int)
        df['total_sales'] = df['total_sales'].astype(float)
        
        # Create time-based features
        df['time_index'] = range(1, len(df) + 1)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Prepare training data
        X = df[['time_index', 'month_sin', 'month_cos']].values
        y = df['total_sales'].values
        
        # Scale features
        scaler_X = StandardScaler()
        X_scaled = scaler_X.fit_transform(X)
        
        # Train model
        model = LinearRegression()
        model.fit(X_scaled, y)
        
        # Validation metrics
        y_pred = model.predict(X_scaled)
        mse = mean_squared_error(y, y_pred)
        mape = mean_absolute_percentage_error(y, y_pred) * 100
        
        # Generate future dates - starting from the most recent data point
        last_year = int(df['year'].iloc[-1])
        last_month = int(df['month'].iloc[-1])
        
        predictions = []
        current_year = last_year
        current_month = last_month
        
        for i in range(1, months_ahead + 1):
            # Move to the next month in sequence
            current_month += 1
            
            # Handle year transition
            if current_month > 12:
                current_month = 1
                current_year += 1
            
            # Calculate features for prediction
            time_index = len(df) + i
            month_sin = np.sin(2 * np.pi * current_month / 12)
            month_cos = np.cos(2 * np.pi * current_month / 12)
            
            X_pred = np.array([[time_index, month_sin, month_cos]])
            X_pred_scaled = scaler_X.transform(X_pred)
            
            # Make prediction
            predicted_sales = model.predict(X_pred_scaled)[0]
            
            month_name = pd.Timestamp(year=current_year, month=current_month, day=1).strftime('%B')
            date_str = pd.Timestamp(year=current_year, month=current_month, day=1).strftime('%Y-%m-%d')
            
            predictions.append({
                'year': current_year,
                'month': current_month,
                'month_name': month_name,
                'predicted_sales': round(predicted_sales, 2),
                'date': date_str
            })
        
        # Also return the actual sales data with date values for consistent display
        historical_data = []
        for _, row in df.iterrows():
            year = int(row['year'])
            month = int(row['month'])
            date_str = pd.Timestamp(year=year, month=month, day=1).strftime('%Y-%m-%d')
            historical_data.append({
                'year': year,
                'month': month,
                'month_name': pd.Timestamp(year=year, month=month, day=1).strftime('%B'),
                'total_sales': float(row['total_sales']),
                'date': date_str
            })
        
        return jsonify({
            'predictions': predictions,
            'historical_data': historical_data,
            'model_info': {
                'type': 'Linear Regression',
                'training_data_points': len(df),
                'mse': round(mse, 2),
                'mape': round(mape, 2)
            }
        })
    
    except Exception as e:
        print("Error in prediction:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5000))
    app.run(host='0.0.0.0', port=port)
