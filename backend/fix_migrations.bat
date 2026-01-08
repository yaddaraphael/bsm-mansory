@echo off
echo Fixing migrations...
echo.

REM Activate virtual environment
call venv\Scripts\activate.bat

echo Creating migrations for all apps...
python manage.py makemigrations accounts
python manage.py makemigrations branches
python manage.py makemigrations projects
python manage.py makemigrations equipment
python manage.py makemigrations time_tracking
python manage.py makemigrations audit

echo.
echo Running migrations...
python manage.py migrate

echo.
echo Done!
pause

