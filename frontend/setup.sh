#!/bin/bash

echo "Setting up BSM Frontend..."
echo

echo "Installing dependencies..."
npm install

echo
echo "Creating .env.local file if it doesn't exist..."
if [ ! -f ".env.local" ]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local
    echo ".env.local file created!"
    echo
fi

echo
echo "========================================"
echo "Setup complete!"
echo
echo "Next steps:"
echo "1. Ensure backend is running on http://localhost:8000"
echo "2. Run: npm run dev"
echo "3. Open http://localhost:3000 in your browser"
echo "========================================"

