from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserSummary(BaseModel):
    id: str
    username: str
    display_name: str
    role: str
    roles: list[str] = []


class LoginPayload(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: UserSummary


class MePayload(BaseModel):
    id: str
    username: str
    display_name: str
    roles: list[str]
    theme: str
    platform_name: str
    expires_at: str | None = None


class ClassCodeRequest(BaseModel):
    class_code: str


class ClassRosterRequest(BaseModel):
    """学生登录页取名单：class_id 来自公开班级列表，class_code 是老师投屏的快捷入口。"""

    class_id: int | None = None
    class_code: str | None = None


class ClassRosterStudent(BaseModel):
    user_id: int
    display_name: str
    student_no: str
    seat_label: str | None = None


class ClassRosterPayload(BaseModel):
    class_id: int
    class_name: str
    class_code: str
    student_count: int
    students: list[ClassRosterStudent]


class ClassLoginRequest(BaseModel):
    class_id: int
    student_user_id: int
    password: str


class ClassGuestPayload(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    class_id: int
    class_name: str


class ClassOptionItem(BaseModel):
    id: int
    class_name: str
    grade_no: int
    class_no: int


class ClassOptionGrade(BaseModel):
    grade_no: int
    classes: list[ClassOptionItem]
