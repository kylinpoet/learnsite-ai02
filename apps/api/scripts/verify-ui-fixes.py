"""三处修复的浏览器验收：读取真实 computed color，而非肉眼判断。

用法：apps/api/.venv/bin/python scripts/verify-ui-fixes.py
前提：dev server 已在 5173 运行（vite 代理 /api 到 8010）。
"""
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
ADMIN_USER = "admin"
ADMIN_PASS = "222221"


def parse_rgb(text):
    nums = text.replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",")
    return tuple(float(n) for n in nums[:3])


def luminance(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def report(label, ok, detail):
    print(f"[{'PASS' if ok else 'FAIL'}] {label}: {detail}")
    return ok


results = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # 1) 登录页「切换到…登录」链接 hover
    print("\n=== 1) 登录页切换链接 hover ===")
    for path, label in (("/login/student", "学生登录页"), ("/login/staff", "教师登录页")):
        page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        link = page.locator(".auth-link-stack a").first
        link.wait_for(state="visible", timeout=8000)
        link.hover()
        page.wait_for_timeout(350)
        color = parse_rgb(link.evaluate("el => getComputedStyle(el).color"))
        ratio = contrast(color, (255, 255, 255))
        results.append(report(
            f"{label}切换链接 hover 可读", ratio >= 3.0,
            f"文字 {color} 对白底对比度 {ratio:.2f}（修复前 1.00，白字压白底）",
        ))

    # 2) 系统设置 › 班级 操作按钮 hover（text 按钮走 primaryColorHover）
    print("\n=== 2) 班级列表操作按钮 hover ===")
    page.goto(f"{BASE}/login/staff", wait_until="domcontentloaded")
    page.wait_for_timeout(500)
    page.get_by_placeholder("请输入账号").fill(ADMIN_USER)
    page.get_by_placeholder("请输入密码").fill(ADMIN_PASS)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url(lambda url: "/staff" in url, timeout=15000)
    page.wait_for_timeout(1000)
    page.goto(f"{BASE}/staff/admin/system?tab=classes", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    for name in ("权限设置", "编辑"):
        btn = page.get_by_role("button", name=name, exact=True).first
        btn.wait_for(state="visible", timeout=10000)
        btn.hover()
        page.wait_for_timeout(350)
        color = parse_rgb(btn.evaluate("el => getComputedStyle(el).color"))
        ratio = contrast(color, (255, 255, 255))
        results.append(report(
            f"「{name}」hover 可读", ratio >= 3.0,
            f"文字 {color} 对比度 {ratio:.2f}",
        ))

    # 3) 删除有记录的班级：拦截提示要点名班级并给出下一步
    print("\n=== 3) 删除受阻提示 ===")
    data_row = page.locator("tbody tr").first
    data_row.wait_for(state="visible", timeout=10000)
    class_text = data_row.inner_text().split("\n")[0].split("\t")[0].strip()
    data_row.get_by_role("button", name="删除").first.click()
    page.wait_for_timeout(700)
    page.locator(".n-dialog").last.get_by_role("button", name="确定").click()
    page.wait_for_timeout(1800)

    dialogs = page.locator(".n-dialog")
    text = dialogs.nth(dialogs.count() - 1).inner_text()
    print(f"目标班级: {class_text}")
    print("---- 提示内容 ----")
    print(text)
    print("------------------")
    class_code = class_text.split("班")[0]
    checks = {
        "点名班级": class_code in text,
        "给出数量": any(ch.isdigit() for ch in text),
        "指明去处": ("学生" in text or "学案" in text),
        "给出出口": ("升班与归档" in text or "保留" in text),
        "非一句话拦截": len(text.strip()) > 60,
    }
    results.append(report(
        "删除提示完整可执行", all(checks.values()),
        ", ".join(f"{k}={'有' if v else '缺'}" for k, v in checks.items()),
    ))

    browser.close()

print()
print(f"全部通过: {all(results)}  ({sum(results)}/{len(results)})")
sys.exit(0 if all(results) else 1)
