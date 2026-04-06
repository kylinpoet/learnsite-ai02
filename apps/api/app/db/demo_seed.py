from __future__ import annotations

from sqlalchemy import select

from app.db.init_db import ensure_demo_group_tasks, ensure_runtime_schema, seed_fresh_demo_data
from app.db.session import SessionLocal, engine
from app.models import Base, User


def seed_demo_data() -> bool:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_schema()

    with SessionLocal() as session:
        has_user = session.scalar(select(User.id).limit(1))
        if has_user:
            return False

        seed_fresh_demo_data(session)
        ensure_demo_group_tasks(session)
        session.commit()
        return True


def main() -> None:
    seeded = seed_demo_data()
    if seeded:
        print("LearnSite demo data seeded.")
        print("Student: 70101 / 12345")
        print("Students: 70101-70110, 70201-70210, 70301-70310, 80901-80910, 81201-81210 / 12345")
        print("Teacher: t1 / 222221")
        print("Teacher2: t2 / 222221")
        print("Admin: admin / 222221")
        return

    print("Skipped demo seed because the current database already has users.")


if __name__ == "__main__":
    main()
