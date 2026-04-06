import type { TaskHtmlPromptTemplateOption, TaskTemplatePresetOption } from './lessonPlan.types';

export const taskTemplatePresetOptions: TaskTemplatePresetOption[] = [
  { id: 'rich_text', label: '图文任务', description: '适合布置说明、展示、总结类图文内容任务。' },
  { id: 'discussion', label: '讨论任务', description: '用于课堂讨论、观点表达与同伴互动回复。' },
  { id: 'web_page', label: '网页任务', description: '支持直接编写或上传 HTML 网页作为任务页面。' },
  { id: 'data_submit', label: '数据提交任务', description: '自动生成提交接口，并支持提交页与可视化页。' },
  { id: 'reading', label: '阅读任务', description: '适合导读、自学、预习与阅读理解类任务。' },
  { id: 'upload_image', label: '作品上传', description: '用于上传图片、文档或其他学习成果附件。' },
  { id: 'programming', label: '编程任务', description: '适合 Python 等编程练习、实验与作品提交。' },
];

export const taskHtmlPromptTemplateOptions: TaskHtmlPromptTemplateOption[] = [
  {
    id: 'web_interactive_guide',
    slot: 'web',
    label: '交互导览页',
    description: '生成带步骤说明、按钮交互和结果提示的学习网页。',
    prompt: '页面包含标题、任务说明、操作步骤、互动按钮和简洁反馈，适合学生边看边做。',
  },
  {
    id: 'web_lab_workspace',
    slot: 'web',
    label: '实验操作页',
    description: '适合模拟实验、探究活动和操作记录场景。',
    prompt: '页面突出实验流程、观察记录区和关键提示，布局清晰，适合课堂操作。',
  },
  {
    id: 'web_game_challenge',
    slot: 'web',
    label: '闯关挑战页',
    description: '适合做游戏化练习、关卡挑战或即时反馈任务。',
    prompt: '页面带有闯关氛围、分步挑战和即时反馈，视觉更活泼但保持课堂可用性。',
  },
  {
    id: 'data_submit_form_basic',
    slot: 'data_submit_form',
    label: '基础表单',
    description: '生成简洁直接的数据填写与提交页面。',
    prompt: '页面以表单提交为主，字段清晰、提交路径明确，并展示提交结果反馈。',
  },
  {
    id: 'data_submit_form_experiment',
    slot: 'data_submit_form',
    label: '实验记录页',
    description: '适合实验数据、观察记录、测量结果等提交场景。',
    prompt: '页面突出实验背景、数据填写区和备注说明，适合学生提交实验记录。',
  },
  {
    id: 'data_submit_form_survey',
    slot: 'data_submit_form',
    label: '问卷采集页',
    description: '适合调查问卷、课堂反馈与信息采集任务。',
    prompt: '页面更像课堂问卷，重视填写体验和提交反馈，字段排版紧凑清晰。',
  },
  {
    id: 'data_submit_visualization_dashboard',
    slot: 'data_submit_visualization',
    label: '数据看板',
    description: '生成总览卡片、统计信息和列表并存的展示页。',
    prompt: '页面以数据看板形式展示，包含关键指标、简洁统计卡片和明细列表。',
  },
  {
    id: 'data_submit_visualization_chart',
    slot: 'data_submit_visualization',
    label: '图表分析页',
    description: '适合用图表方式展示成绩、实验结果或调查统计。',
    prompt: '页面重点展示图表分析，可使用原生 HTML/CSS/Canvas/SVG，不依赖外部框架。',
  },
  {
    id: 'data_submit_visualization_gallery',
    slot: 'data_submit_visualization',
    label: '成果展示页',
    description: '适合按卡片、图库或作品墙形式展示提交结果。',
    prompt: '页面更偏向成果展示墙，适合将提交结果以卡片、作品或案例方式呈现。',
  },
];
