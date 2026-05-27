"""Initialize the database and create an admin user."""
from app.database import engine, Base, SessionLocal
from app.models.models import User
from app.services.auth import hash_password
from app.utils.migrate import run_migrations

# Create all tables
Base.metadata.create_all(bind=engine)
run_migrations()
print("Tables created.")

# Create admin user if none exists
db = SessionLocal()
admin = db.query(User).filter(User.role == "admin").first()
if not admin:
    admin = User(
        email="admin@admin.com",
        password_hash=hash_password("admin123"),
        name="Admin",
        role="admin",
    )
    db.add(admin)
    db.commit()
    print("Admin user created: admin@admin.com / admin123")
else:
    print("Admin user already exists.")
db.close()
