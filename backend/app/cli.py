"""Flask CLI commands: DB seed, role bootstrap, admin creation."""
from __future__ import annotations

import click
from flask import Flask
from flask.cli import with_appcontext

DEFAULT_PERMISSIONS = [
    ("assessment.create", "Create assessments"),
    ("assessment.read", "View assessments"),
    ("assessment.update", "Edit assessments"),
    ("assessment.delete", "Delete assessments"),
    ("session.monitor", "Live-monitor sessions"),
    ("alert.review", "Review integrity alerts"),
    ("user.manage", "Manage users"),
    ("settings.manage", "Manage system settings"),
    ("audit.read", "Read audit logs"),
    ("report.export", "Export reports"),
]

ROLE_PERMISSIONS = {
    "admin": [p[0] for p in DEFAULT_PERMISSIONS],
    "recruiter": [
        "assessment.create", "assessment.read", "assessment.update", "assessment.delete",
        "session.monitor", "alert.review", "report.export",
    ],
    "candidate": ["assessment.read"],
}


def register_cli(app: Flask) -> None:
    @app.cli.command("seed-roles")
    @with_appcontext
    def seed_roles():
        """Create default permissions and roles."""
        from app.extensions import db
        from app.models import Permission, Role

        perms: dict[str, Permission] = {}
        for code, desc in DEFAULT_PERMISSIONS:
            perm = Permission.query.filter_by(code=code).first()
            if not perm:
                perm = Permission(code=code, description=desc)
                db.session.add(perm)
            perms[code] = perm
        db.session.flush()

        for role_name, codes in ROLE_PERMISSIONS.items():
            role = Role.query.filter_by(name=role_name).first()
            if not role:
                role = Role(name=role_name, description=f"{role_name.title()} role", is_system=True)
                db.session.add(role)
            role.permissions = [perms[c] for c in codes]
        db.session.commit()
        click.echo("Seeded roles and permissions.")

        # Seed default admin user
        from app.models import User
        from app.models.enums import UserRole, UserStatus
        from app.security import hash_password
        from app.services import auth_service

        admin_email = "admin@semanticservices.rw"
        if not User.query.filter_by(email=admin_email).first():
            admin_role = Role.query.filter_by(name="admin").first()
            admin_user = User(
                full_name="Administrator",
                email=admin_email,
                password_hash=hash_password("admin123"),
                role_name=UserRole.admin,
                role_id=admin_role.id if admin_role else None,
                status=UserStatus.active,
                email_verified=True,
            )
            db.session.add(admin_user)
            db.session.commit()
            click.echo(f"Seeded default admin user: {admin_email}")

        # Seed default recruiter user
        recruiter_email = "sarah.williams@semanticservices.rw"
        if not User.query.filter_by(email=recruiter_email).first():
            data = {
                "email": recruiter_email,
                "password": "recruiter123",
                "full_name": "Sarah Williams",
                "role": "recruiter",
                "department": "Human Resources",
            }
            auth_service.register(data)
            click.echo(f"Seeded default recruiter user: {recruiter_email}")

    @app.cli.command("create-admin")
    @click.option("--email", required=True)
    @click.option("--password", required=True)
    @click.option("--name", default="Administrator")
    @with_appcontext
    def create_admin(email, password, name):
        """Create an admin user."""
        from app.extensions import db
        from app.models import Role, User
        from app.models.enums import UserRole, UserStatus
        from app.security import hash_password

        if User.query.filter_by(email=email).first():
            click.echo(f"User {email} already exists.")
            return
        admin_role = Role.query.filter_by(name="admin").first()
        user = User(
            full_name=name,
            email=email.lower(),
            password_hash=hash_password(password),
            role_name=UserRole.admin,
            role_id=admin_role.id if admin_role else None,
            status=UserStatus.active,
            email_verified=True,
        )
        db.session.add(user)
        db.session.commit()
        click.echo(f"Created admin {email}.")

    @app.cli.command("create-user")
    @click.option("--email", required=True)
    @click.option("--password", required=True)
    @click.option("--role", type=click.Choice(["admin", "recruiter", "candidate"]), default="candidate")
    @click.option("--name", required=True)
    @click.option("--department", default=None)
    @with_appcontext
    def create_user(email, password, role, name, department):
        """Create a user with a specific role (candidate, recruiter, admin)."""
        from app.extensions import db
        from app.models import User, Role
        from app.models.enums import UserRole
        from app.services import auth_service

        role_enum = UserRole(role)
        if User.query.filter_by(email=email.lower().strip()).first():
            click.echo(f"User {email} already exists.")
            return

        try:
            if role_enum == UserRole.admin:
                from app.models import Role, User
                from app.models.enums import UserRole, UserStatus
                from app.security import hash_password
                
                admin_role = Role.query.filter_by(name="admin").first()
                user = User(
                    full_name=name,
                    email=email.lower().strip(),
                    password_hash=hash_password(password),
                    role_name=UserRole.admin,
                    role_id=admin_role.id if admin_role else None,
                    status=UserStatus.active,
                    email_verified=True,
                )
                db.session.add(user)
                db.session.commit()
                click.echo(f"Created admin {email}.")
            else:
                data = {
                    "email": email,
                    "password": password,
                    "full_name": name,
                    "role": role,
                    "department": department,
                }
                user, _ = auth_service.register(data)
                click.echo(f"Created {role} {email}.")
        except Exception as e:
            click.echo(f"Error: {e}")

