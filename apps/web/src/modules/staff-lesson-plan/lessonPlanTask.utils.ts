import { normalizeRichTextHtml, richTextToExcerpt } from '@/utils/richText';

import type {
  CustomTaskTemplate,
  PlanFormTask,
  TaskAssetManifestItem,
  TaskAssetSlot,
  TaskTemplatePresetId,
} from './lessonPlan.types';

export function taskAssetSlotLabel(slot: TaskAssetSlot) {
  if (slot === 'web') {
    return '网页任务页';
  }
  if (slot === 'data_submit_form') {
    return '学生提交页';
  }
  return '可视化页';
}

export function defaultTaskHtmlPromptTemplateId(slot: TaskAssetSlot) {
  if (slot === 'data_submit_form') {
    return 'data_submit_form_basic';
  }
  if (slot === 'data_submit_visualization') {
    return 'data_submit_visualization_dashboard';
  }
  return 'web_interactive_guide';
}

export function taskTypeLabel(taskType: string) {
  if (taskType === 'rich_text') {
    return '图文任务';
  }
  if (taskType === 'web_page') {
    return '网页任务';
  }
  if (taskType === 'discussion') {
    return '讨论任务';
  }
  if (taskType === 'data_submit') {
    return '数据提交任务';
  }
  if (taskType === 'reading') {
    return '阅读任务';
  }
  if (taskType === 'programming') {
    return '编程任务';
  }
  return '上传作品';
}

export function taskEditorTabTitle(task: Pick<PlanFormTask, 'title'>, index: number) {
  return task.title.trim() || `任务 ${index + 1}`;
}

export function taskDescriptionGenerationKey(task: Pick<PlanFormTask, 'key'>) {
  return `${task.key}:description`;
}

export function taskAssetGenerationKey(task: Pick<PlanFormTask, 'key'>, slot: TaskAssetSlot) {
  return `${task.key}:${slot}`;
}

export function buildTemplateTaskTitle(templateId: TaskTemplatePresetId, sequence: number) {
  if (templateId === 'reading') {
    return `阅读任务 ${sequence}`;
  }
  if (templateId === 'rich_text') {
    return `图文任务 ${sequence}`;
  }
  if (templateId === 'upload_image') {
    return `上传作品 ${sequence}`;
  }
  if (templateId === 'programming') {
    return `编程任务 ${sequence}`;
  }
  if (templateId === 'discussion') {
    return `课堂讨论 ${sequence}`;
  }
  if (templateId === 'web_page') {
    return `网页任务 ${sequence}`;
  }
  return `数据提交任务 ${sequence}`;
}

export function buildWebTaskStarterHtml(title: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      }
      body {
        margin: 0;
        padding: 24px;
        background: linear-gradient(180deg, #f5f8ff 0%, #ffffff 100%);
        color: #1f2a44;
      }
      .panel {
        max-width: 860px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 42px rgba(66, 97, 162, 0.14);
      }
      .badge {
        display: inline-flex;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(66, 97, 162, 0.12);
        color: #4261a2;
        font-size: 12px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }
      button {
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        background: #4261a2;
        color: #fff;
        cursor: pointer;
      }
      #status {
        margin-top: 18px;
        color: #5a6786;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <span class="badge">网页任务</span>
      <h1>${title}</h1>
      <p>这里是网页任务页面。你可以继续补充交互、嵌入素材，或替换为自己上传的完整网页文件。</p>
      <ol>
        <li>在上方源码区域继续修改当前 HTML。</li>
        <li>如果页面需要多文件结构，可直接上传 ZIP、多文件或文件夹。</li>
        <li>如需读取任务上下文，可访问 <code>window.__LEARNSITE_TASK_CONTEXT__</code>。</li>
      </ol>
      <div class="actions">
        <button id="show-context" type="button">查看任务上下文</button>
      </div>
      <p id="status">点击按钮后，可在这里查看当前任务的上下文摘要。</p>
    </main>
    <script>
      const statusElement = document.getElementById('status');
      const context = window.__LEARNSITE_TASK_CONTEXT__ || {};
      document.getElementById('show-context')?.addEventListener('click', () => {
        const slot = context.slot || 'web';
        const slotLabelMap = {
          web: '任务正文',
          data_submit_form: '学生提交页',
          data_submit_visualization: '数据看板',
        };
        const taskId = context.taskId || '未生成';
        const slotLabel = slotLabelMap[slot] || slot;
        statusElement.textContent = '任务 ID: ' + taskId + '，当前页面：' + slotLabel + '。';
      });
    <\/script>
  </body>
</html>`;
}

export function buildDataSubmitFormStarterHtml(title: string, submitApiUrl: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - 学生提交页</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        background: linear-gradient(180deg, #f4f7ff 0%, #ffffff 100%);
        color: #24324a;
      }
      .panel {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 42px rgba(66, 97, 162, 0.14);
      }
      form {
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
      }
      input,
      textarea {
        border: 1px solid #cfd8ea;
        border-radius: 14px;
        padding: 10px 12px;
        font: inherit;
      }
      button {
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        background: #4261a2;
        color: #fff;
        cursor: pointer;
      }
      #status {
        min-height: 24px;
        color: #5a6786;
      }
      .api-box {
        margin: 0 0 16px;
        padding: 12px 14px;
        border-radius: 16px;
        background: #eef4ff;
        color: #30456f;
        font-size: 13px;
        line-height: 1.7;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>${title}</h1>
      <p>这里用于收集学生提交的数据结果。你可以根据课堂需要调整字段、说明和页面样式。</p>
      <div class="api-box">
        <strong>提交接口：</strong>
        <span>${submitApiUrl || '接口地址暂未生成'}</span>
      </div>
      <form id="submit-form">
        <label>
          学生姓名
          <input id="student-name" name="student_name" placeholder="请输入姓名" />
        </label>
        <label>
          分数
          <input id="student-score" name="score" type="number" min="0" max="100" step="1" placeholder="请输入分数" />
        </label>
        <label>
          补充说明
          <textarea id="student-note" name="note" rows="4" placeholder="补充说明你的实验结果或观察。"></textarea>
        </label>
        <button type="submit">提交数据</button>
      </form>
      <p id="status">保存学案后，学生进入任务即可在这里提交数据。</p>
    </main>
    <script>
      const formElement = document.getElementById('submit-form');
      const statusElement = document.getElementById('status');
      const SUBMIT_API_URL = ${JSON.stringify(submitApiUrl)};

      formElement?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!SUBMIT_API_URL) {
          statusElement.textContent = '提交接口尚未生成';
          return;
        }

        const payload = {
          student_name: document.getElementById('student-name')?.value || '',
          score: Number(document.getElementById('student-score')?.value || 0),
          note: document.getElementById('student-note')?.value || '',
        };

        try {
          const response = await fetch(SUBMIT_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            throw new Error((await response.text()) || '提交失败');
          }
          statusElement.textContent = '数据提交成功，已记录本次结果。';
          formElement.reset();
        } catch (error) {
          statusElement.textContent = error instanceof Error ? error.message : '提交失败，请稍后再试';
        }
      });
    <\/script>
  </body>
</html>`;
}

export function buildDataSubmitVisualizationStarterHtml(title: string, recordsApiUrl: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - 可视化页</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        background: linear-gradient(180deg, #fffaf2 0%, #ffffff 100%);
        color: #3c2f1f;
      }
      .shell {
        max-width: 980px;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }
      .metrics {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .card {
        padding: 18px;
        border-radius: 20px;
        background: #ffffff;
        box-shadow: 0 16px 34px rgba(180, 122, 53, 0.12);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 10px 8px;
        border-bottom: 1px solid #efe3cf;
        text-align: left;
      }
      #status {
        color: #7d6648;
      }
      .api-box {
        padding: 14px 16px;
        border-radius: 16px;
        background: #fff1d9;
        color: #7d6648;
        font-size: 13px;
        line-height: 1.7;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="api-box">
        <strong>读取接口：</strong>
        <span>${recordsApiUrl || '接口地址暂未生成'}</span>
      </section>
      <section class="metrics">
        <article class="card">
          <p>提交总数</p>
          <h2 id="record-count">0</h2>
        </article>
        <article class="card">
          <p>平均分</p>
          <h2 id="average-score">--</h2>
        </article>
      </section>

      <section class="card">
        <h1>${title}</h1>
        <p id="status">保存学案并进入学生端后，这里会自动读取最新提交记录。</p>
        <table>
          <thead>
            <tr>
              <th>提交时间</th>
              <th>提交者</th>
              <th>姓名</th>
              <th>分数</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody id="records-body">
            <tr>
              <td colspan="5">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
    <script>
      const RECORDS_API_URL = ${JSON.stringify(recordsApiUrl)};
      const statusElement = document.getElementById('status');
      const bodyElement = document.getElementById('records-body');
      const countElement = document.getElementById('record-count');
      const averageElement = document.getElementById('average-score');

      async function loadRecords() {
        if (!RECORDS_API_URL) {
          statusElement.textContent = '读取接口尚未生成';
          return;
        }

        try {
          const response = await fetch(RECORDS_API_URL);
          if (!response.ok) {
            throw new Error((await response.text()) || '读取失败');
          }
          const payload = await response.json();
          const items = payload.data?.items || [];
          countElement.textContent = String(items.length);
          const scores = items
            .map((item) => Number(item.payload?.score))
            .filter((value) => !Number.isNaN(value));
          averageElement.textContent = scores.length
            ? String((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1))
            : '--';

          if (!items.length) {
            bodyElement.innerHTML = '<tr><td colspan="5">暂无数据</td></tr>';
            statusElement.textContent = '暂时还没有提交数据';
            return;
          }

          bodyElement.innerHTML = items
            .map((item) => {
              const payload = item.payload || {};
              return '<tr>' +
                '<td>' + (item.created_at || '--') + '</td>' +
                '<td>' + (item.submitted_by?.display_name || '--') + '</td>' +
                '<td>' + (payload.student_name || '--') + '</td>' +
                '<td>' + (payload.score ?? '--') + '</td>' +
                '<td>' + (payload.note || '--') + '</td>' +
              '</tr>';
            })
            .join('');
          statusElement.textContent = '已读取最新数据';
        } catch (error) {
          statusElement.textContent = error instanceof Error ? error.message : '读取失败，请稍后再试';
        }
      }

      loadRecords();
    <\/script>
  </body>
</html>`;
}

export function buildTemplateTaskDescription(templateId: TaskTemplatePresetId, title: string) {
  if (templateId === 'reading') {
    return `<p><strong>${title}</strong>：请先阅读本节材料，完成阅读理解后再进入后续活动。</p><ul><li>先浏览导读与重点提示</li><li>记录关键信息或疑问</li><li>完成已读确认</li></ul>`;
  }
  if (templateId === 'rich_text') {
    return `<p><strong>${title}</strong>：请根据学案要求整理你的图文成果。</p><ol><li>明确任务目标</li><li>按步骤完成图文整理</li><li>提交时补充必要说明</li></ol>`;
  }
  if (templateId === 'upload_image') {
    return `<p><strong>${title}</strong>：请上传本次活动作品，可附图片、文档或其他相关附件。</p><ul><li>附件命名清晰</li><li>必要时补充作品说明</li><li>确认提交版本正确</li></ul>`;
  }
  if (templateId === 'programming') {
    return `<p><strong>${title}</strong>：请在编程任务页完成代码编写、运行与提交。</p><ul><li>阅读任务要求</li><li>完成代码实现</li><li>测试通过后再提交</li></ul>`;
  }
  if (templateId === 'discussion') {
    return `<p><strong>${title}</strong>：请围绕课堂主题发表观点，并结合事实、案例或同学发言进行回应。</p><ul><li>先阅读讨论主题</li><li>表达自己的判断与理由</li><li>适当回应其他同学观点</li></ul>`;
  }
  if (templateId === 'web_page') {
    return `<p><strong>${title}</strong>：请在嵌入网页任务中完成互动操作，并按页面提示整理学习结果。</p><ul><li>阅读页面说明</li><li>完成网页中的互动任务</li><li>如有结果页面，注意核对输出内容</li></ul>`;
  }
  return `<p><strong>${title}</strong>：请在提交页完成数据填写，并在可视化页查看全班结果。</p><ol><li>填写表单并提交数据</li><li>检查提交是否成功</li><li>切换到可视化页查看统计结果</li></ol>`;
}

export function buildSuggestedTaskTemplateName(task: PlanFormTask) {
  const base = task.title.trim() || taskTypeLabel(task.task_type) || '任务';
  if (base.endsWith('模板')) {
    return base.slice(0, 120);
  }
  return `${base}模板`.slice(0, 120);
}

export function buildSuggestedTaskTemplateSummary(task: PlanFormTask) {
  const excerpt = richTextToExcerpt(task.description, 120);
  if (excerpt) {
    return excerpt;
  }
  return `${taskTypeLabel(task.task_type)} · ${task.submission_scope === 'group' ? '小组共同提交' : '个人提交'}`;
}

export function buildTaskTemplateConfigPayload(task: PlanFormTask) {
  if (task.task_type === 'discussion') {
    return {
      topic: task.config.topic.trim(),
    };
  }

  if (task.task_type === 'web_page') {
    return {
      entry_path: task.config.entry_path.trim() || 'index.html',
      entry_html_source: task.config.entry_html_source.trim() || undefined,
    };
  }

  if (task.task_type === 'data_submit') {
    return {
      submit_entry_path: task.config.submit_entry_path.trim() || 'index.html',
      visualization_entry_path: task.config.visualization_entry_path.trim() || 'index.html',
      submit_html_source: task.config.submit_html_source.trim() || undefined,
      visualization_html_source: task.config.visualization_html_source.trim() || undefined,
    };
  }

  if (task.task_type === 'rich_text') {
    return {};
  }

  return null;
}

export function buildTaskConfigPayload(task: PlanFormTask) {
  if (task.task_type === 'discussion') {
    return {
      topic: task.config.topic.trim(),
    };
  }

  if (task.task_type === 'web_page') {
    return {
      entry_path: task.config.entry_path.trim() || 'index.html',
      assets: serializeAssetManifest(task.config.assets),
      entry_html_source: task.config.entry_html_source.trim() || undefined,
    };
  }

  if (task.task_type === 'data_submit') {
    return {
      endpoint_token: task.config.endpoint_token.trim() || undefined,
      submit_entry_path: task.config.submit_entry_path.trim() || 'index.html',
      visualization_entry_path: task.config.visualization_entry_path.trim() || 'index.html',
      submit_assets: serializeAssetManifest(task.config.submit_assets),
      visualization_assets: serializeAssetManifest(task.config.visualization_assets),
      submit_html_source: task.config.submit_html_source.trim() || undefined,
      visualization_html_source: task.config.visualization_html_source.trim() || undefined,
    };
  }

  if (task.task_type === 'rich_text') {
    return {};
  }

  return null;
}

export function planStatusLabel(status: string) {
  if (status === 'draft') {
    return '草稿';
  }
  if (status === 'published') {
    return '已发布';
  }
  if (status === 'active') {
    return '上课中';
  }
  if (status === 'completed') {
    return '已完成';
  }
  return status;
}

export function planStatusType(status: string) {
  if (status === 'draft') {
    return 'info';
  }
  if (status === 'published') {
    return 'success';
  }
  if (status === 'active') {
    return 'warning';
  }
  return 'info';
}

export function isTaskScopeFixed(taskType: string) {
  return taskType === 'reading' || taskType === 'discussion';
}

export function normalizeHtmlValue(value: string, mode: 'visual' | 'source') {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/<(style|script|iframe|object|embed|html|head|body)\b/i.test(trimmed)) {
    return trimmed;
  }
  if (mode === 'source') {
    return trimmed;
  }
  return normalizeRichTextHtml(value) || trimmed;
}

export function serializeAssetManifest(items: TaskAssetManifestItem[]) {
  return items.map((item) => ({
    path: item.path,
    size_kb: item.size_kb,
    mime_type: item.mime_type || null,
    slot: item.slot || null,
  }));
}

type CreateTaskFromTemplateOptions = {
  createEmptyTask: () => PlanFormTask;
  nextTemplateSequence: (taskType?: string) => number;
  normalizeTaskSubmissionScope: (taskType: string, currentScope?: string) => string;
  ensureDataSubmitTaskConfig: (task: PlanFormTask) => void;
};

export function createTaskFromTemplate(templateId: TaskTemplatePresetId, options: CreateTaskFromTemplateOptions) {
  const task = options.createEmptyTask();
  const title = buildTemplateTaskTitle(templateId, options.nextTemplateSequence(templateId));

  task.title = title;
  task.task_type = templateId;
  task.submission_scope = options.normalizeTaskSubmissionScope(templateId, 'individual');
  task.description = buildTemplateTaskDescription(templateId, title);
  task.description_mode = 'visual';

  if (templateId === 'discussion') {
    task.config.topic = `围绕“${title}”发表你的观点，并至少回复一位同学。`;
  } else if (templateId === 'web_page') {
    task.config.entry_html_source = buildWebTaskStarterHtml(title);
    task.config.entry_path = 'index.html';
  } else if (templateId === 'data_submit') {
    task.config.submit_entry_path = 'index.html';
    task.config.visualization_entry_path = 'index.html';
    options.ensureDataSubmitTaskConfig(task);
  }

  return task;
}

type CreateTaskFromCustomTemplateHelpers = {
  createEmptyTask: () => PlanFormTask;
  normalizeTaskSubmissionScope: (taskType: string, currentScope?: string) => string;
  normalizeTaskConfigState: (taskType: string, rawConfig: unknown) => PlanFormTask['config'];
  ensureDataSubmitTaskConfig: (task: PlanFormTask) => void;
};

export function createTaskFromCustomTemplate(
  template: CustomTaskTemplate,
  helpers: CreateTaskFromCustomTemplateHelpers,
  options?: {
    linkTemplate?: boolean;
  }
) {
  const task = helpers.createEmptyTask();
  task.title = template.task_title.trim() || template.title.trim() || task.title;
  task.task_type = template.task_type;
  task.submission_scope = helpers.normalizeTaskSubmissionScope(template.task_type, template.submission_scope);
  task.description = template.task_description || '';
  task.description_mode = 'visual';
  task.config = helpers.normalizeTaskConfigState(template.task_type, template.config);
  helpers.ensureDataSubmitTaskConfig(task);
  task.is_required = template.is_required;
  task.linked_template_id = options?.linkTemplate ? template.id : null;
  return task;
}
