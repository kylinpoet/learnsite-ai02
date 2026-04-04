def student_home_payload() -> dict:
    return {
        "pending_courses": [
            {"id": 22, "title": "心理测评", "date": "2026-03-30"},
            {"id": 21, "title": "第3课 人工智能技术基础", "date": "2026-03-25"},
        ],
        "completed_courses": [
            {"id": 18, "title": "八下第一单元 第2课 人工智能应用", "date": "2026-03-18"},
            {"id": 16, "title": "八下第一单元 第1课 走进人工智能", "date": "2026-03-12"},
        ],
        "profile": {
            "student_no": "240101",
            "name": "陈安琪",
            "class_name": "8.1班",
        },
    }


def curriculum_tree_payload() -> dict:
    return {
        "books": [
            {
                "id": "book-8-down",
                "name": "八年级下册 信息科技",
                "units": [
                    {
                        "id": "unit-1",
                        "title": "第一单元 人工智能",
                        "lessons": [
                            {"id": 16, "title": "第1课 走进人工智能"},
                            {"id": 18, "title": "第2课 人工智能应用"},
                            {"id": 21, "title": "第3课 人工智能技术基础"},
                        ],
                    }
                ],
            }
        ]
    }


def placeholder_payload(title: str, description: str, highlights: list[dict]) -> dict:
    return {
        "title": title,
        "description": description,
        "highlights": highlights,
    }
