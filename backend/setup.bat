@echo off
echo Setting up BSM Backend...
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Creating .env file if it doesn't exist...
if not exist ".env" (
    echo SECRET_KEY=django-insecure-change-this-in-production > .env
    echo DEBUG=True >> .env
    echo ALLOWED_HOSTS=localhost,127.0.0.1 >> .env
    echo DB_NAME=bsm_db >> .env
    echo DB_USER=postgres >> .env
    echo DB_PASSWORD=postgres >> .env
    echo DB_HOST=localhost >> .env
    echo DB_PORT=5432 >> .env
    echo.
    echo .env file created! Please update DB_PASSWORD with your PostgreSQL password.
    echo.
)

echo.
echo Running migrations...
python manage.py makemigrations
python manage.py migrate

echo.
echo ========================================
echo Setup complete!
echo.
echo Next steps:
echo 1. Update .env file with your PostgreSQL password
echo 2. Run: python manage.py createsuperuser
echo 3. Run: python manage.py runserver
echo ========================================
pause

