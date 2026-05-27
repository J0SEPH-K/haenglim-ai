"""Create 30 users inside group 'ff'."""
from app.database import SessionLocal
from app.models.models import User, Group
from app.services.auth import hash_password

GROUP_NAME = "ff"
COUNT = 30
PASSWORD = "password123"

db = SessionLocal()

group = db.query(Group).filter(Group.name == GROUP_NAME).first()
if not group:
    print(f"Group '{GROUP_NAME}' not found.")
    db.close()
    exit(1)

existing_emails = {
    e for (e,) in db.query(User.email).filter(User.email.like("ff_user_%@example.com")).all()
}

created = 0
i = 1
while created < COUNT:
    email = f"ff_user_{i:03d}@example.com"
    if email not in existing_emails:
        db.add(User(
            email=email,
            password_hash=hash_password(PASSWORD),
            name=f"ff-user-{i:03d}",
            role="user",
            group_id=group.id,
            is_active=True,
        ))
        created += 1
    i += 1

db.commit()
db.close()

print(f"Created {created} users in group '{GROUP_NAME}' (password: {PASSWORD})")
