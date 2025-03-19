#!/bin/bash

# Make script stop on first error
set -e

echo "Starting AI Code Completion application..."

# Start the backend server
echo "Starting backend server on port 5001..."
cd backend
python app.py &
BACKEND_PID=$!
cd ..

echo "Backend started with PID: $BACKEND_PID"
echo "Waiting 3 seconds for backend to initialize..."
sleep 3

# Start the frontend
echo "Starting frontend..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo "Frontend started with PID: $FRONTEND_PID"
echo "Application is now running!"
echo "* Backend: http://localhost:5001"
echo "* Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to clean up on exit
function cleanup {
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Servers stopped"
    exit 0
}

# Set up trap to call cleanup function on exit
trap cleanup INT TERM

# Keep the script running
wait 