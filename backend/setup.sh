#!/bin/bash

echo "Setting up BSM Backend..."
echo

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo
echo "Creating .env file if it doesn't exist..."
if [ ! -f ".env" ]; then
    cat > .env << EOF
SECRET_KEY=django-insecure-change-this-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DB_NAME=bsm_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
EOF
    echo
    echo ".env file created! Please update DB_PASSWORD with your PostgreSQL password."
    echo
fi

echo
echo "Running migrations..."
python manage.py makemigrations
python manage.py migrate

echo
echo "========================================"
echo "Setup complete!"
echo
echo "Next steps:"
echo "1. Update .env file with your PostgreSQL password"
echo "2. Run: python manage.py createsuperuser"
echo "3. Run: python manage.py runserver"
echo "========================================"

