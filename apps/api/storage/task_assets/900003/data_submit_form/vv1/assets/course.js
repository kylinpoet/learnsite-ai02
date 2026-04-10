(function () {
  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function replaceChildren(target, children) {
    if (!target) {
      return;
    }
    target.replaceChildren(...children.filter(Boolean));
  }

  function arraysEqual(left, right) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every(function (value, index) {
      return value === right[index];
    });
  }

  function setsEqual(leftValues, rightValues) {
    if (leftValues.length !== rightValues.length) {
      return false;
    }
    const leftSet = new Set(leftValues);
    return rightValues.every(function (value) {
      return leftSet.has(value);
    });
  }

  function applyTheme(theme) {
    if (!theme) {
      return;
    }
    const root = document.documentElement;
    if (theme.accent) {
      root.style.setProperty("--accent", theme.accent);
    }
    if (theme.accentRgb) {
      root.style.setProperty("--accent-rgb", theme.accentRgb);
    }
    if (theme.accent2) {
      root.style.setProperty("--accent-2", theme.accent2);
    }
    if (theme.background) {
      root.style.setProperty("--bg", theme.background);
    }
    if (theme.backgroundSoft) {
      root.style.setProperty("--bg-soft", theme.backgroundSoft);
    }
  }

  function renderChips(container, items) {
    if (!container || !items || !items.length) {
      return;
    }
    replaceChildren(
      container,
      items.map(function (item) {
        return createElement("span", "chip", item);
      })
    );
  }

  function renderTextCards(container, cards, className) {
    if (!container || !cards || !cards.length) {
      return;
    }
    replaceChildren(
      container,
      cards.map(function (card, index) {
        const item = createElement("article", className || "info-card");
        item.style.setProperty("--delay", index * 0.06 + "s");
        if (card.kicker) {
          item.appendChild(createElement("div", "card-kicker", card.kicker));
        }
        item.appendChild(createElement("h3", "", card.title));
        if (card.text) {
          item.appendChild(createElement("p", "", card.text));
        }
        if (card.list && card.list.length) {
          const list = createElement("ul", "bullet-list");
          card.list.forEach(function (line) {
            list.appendChild(createElement("li", "", line));
          });
          item.appendChild(list);
        }
        return item;
      })
    );
  }

  function renderResources(container, resources) {
    if (!container || !resources || !resources.length) {
      return;
    }
    replaceChildren(
      container,
      resources.map(function (resource, index) {
        const card = createElement("article", "resource-card");
        card.style.setProperty("--delay", index * 0.06 + "s");
        card.appendChild(createElement("h3", "", resource.title));
        card.appendChild(createElement("p", "", resource.text));
        const link = createElement("a", "", resource.linkText || "打开拓展资料");
        link.href = resource.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        card.appendChild(link);
        if (resource.source) {
          card.appendChild(createElement("div", "resource-meta", "来源：" + resource.source));
        }
        return card;
      })
    );
  }

  function getOptionLabel(question, optionId) {
    const target = question.options.find(function (option) {
      return option.id === optionId;
    });
    return target ? target.label : "";
  }

  function buildSingleQuestion(question, index, notifyChange) {
    const state = { value: "" };
    const card = createQuestionShell(question, index, "单选题");
    const optionsGrid = createElement("div", "options-grid");
    const radioName = "question-" + question.id;

    const optionNodes = question.options.map(function (option) {
      const label = createElement("label", "option-card");
      const input = createElement("input");
      input.type = "radio";
      input.name = radioName;
      input.value = option.id;
      input.addEventListener("change", function () {
        state.value = option.id;
        syncSelection();
        notifyChange();
      });

      const copy = createElement("div");
      copy.appendChild(createElement("span", "option-label", option.label));
      if (option.desc) {
        copy.appendChild(createElement("span", "option-desc", option.desc));
      }

      label.appendChild(input);
      label.appendChild(copy);
      optionsGrid.appendChild(label);
      return { optionId: option.id, input: input, label: label };
    });

    function syncSelection() {
      optionNodes.forEach(function (node) {
        const selected = node.optionId === state.value;
        node.input.checked = selected;
        node.label.classList.toggle("is-selected", selected);
      });
    }

    card.appendChild(optionsGrid);

    return {
      prompt: question.prompt,
      element: card,
      isComplete: function () {
        return Boolean(state.value);
      },
      isCorrect: function () {
        return state.value === question.answer;
      },
      getSummary: function () {
        return getOptionLabel(question, state.value) || "未作答";
      },
      reset: function () {
        state.value = "";
        syncSelection();
      }
    };
  }

  function buildMultiQuestion(question, index, notifyChange) {
    const state = { values: [] };
    const card = createQuestionShell(question, index, "多选题");
    const optionsGrid = createElement("div", "options-grid");

    const optionNodes = question.options.map(function (option) {
      const label = createElement("label", "option-card");
      const input = createElement("input");
      input.type = "checkbox";
      input.value = option.id;
      input.addEventListener("change", function () {
        if (input.checked) {
          if (!state.values.includes(option.id)) {
            state.values.push(option.id);
          }
        } else {
          state.values = state.values.filter(function (value) {
            return value !== option.id;
          });
        }
        syncSelection();
        notifyChange();
      });

      const copy = createElement("div");
      copy.appendChild(createElement("span", "option-label", option.label));
      if (option.desc) {
        copy.appendChild(createElement("span", "option-desc", option.desc));
      }

      label.appendChild(input);
      label.appendChild(copy);
      optionsGrid.appendChild(label);
      return { optionId: option.id, input: input, label: label };
    });

    function syncSelection() {
      optionNodes.forEach(function (node) {
        const selected = state.values.includes(node.optionId);
        node.input.checked = selected;
        node.label.classList.toggle("is-selected", selected);
      });
    }

    card.appendChild(optionsGrid);

    return {
      prompt: question.prompt,
      element: card,
      isComplete: function () {
        return state.values.length > 0;
      },
      isCorrect: function () {
        return setsEqual(state.values, question.answer);
      },
      getSummary: function () {
        return state.values.length
          ? state.values.map(function (value) {
              return getOptionLabel(question, value);
            }).join("、")
          : "未作答";
      },
      reset: function () {
        state.values = [];
        syncSelection();
      }
    };
  }

  function buildCategorizeQuestion(question, index, notifyChange) {
    const state = { placements: {} };
    const areas = ["bank"].concat(question.categories.map(function (category) {
      return category.id;
    }));
    let draggingItemId = "";

    question.items.forEach(function (item) {
      state.placements[item.id] = "bank";
    });

    const card = createQuestionShell(question, index, "拖曳分类");
    const layout = createElement("div", "categorize-layout");
    const columns = {};

    const bankColumn = createDropColumn("待分类区", "可拖拽词条，也可点击词条依次切换栏目。");
    columns.bank = bankColumn.list;
    layout.appendChild(bankColumn.column);

    question.categories.forEach(function (category) {
      const area = createDropColumn(category.label, "把对应词条放到这里。");
      columns[category.id] = area.list;
      layout.appendChild(area.column);
    });

    function createDropColumn(title, note) {
      const column = createElement("section", "drop-column");
      const heading = createElement("div", "drop-title", title);
      const desc = createElement("div", "drop-note", note);
      const list = createElement("div", "token-list");

      ["dragover", "dragenter"].forEach(function (eventName) {
        column.addEventListener(eventName, function (event) {
          event.preventDefault();
          column.classList.add("is-hovered");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        column.addEventListener(eventName, function () {
          column.classList.remove("is-hovered");
        });
      });

      column.addEventListener("drop", function (event) {
        event.preventDefault();
        const itemId = event.dataTransfer.getData("text/plain") || draggingItemId;
        if (itemId) {
          moveItem(itemId, Object.keys(columns).find(function (key) {
            return columns[key] === list;
          }));
        }
      });

      column.appendChild(heading);
      column.appendChild(desc);
      column.appendChild(list);
      return { column: column, list: list };
    }

    function nextArea(currentArea) {
      const currentIndex = areas.indexOf(currentArea);
      return areas[(currentIndex + 1) % areas.length];
    }

    function moveItem(itemId, targetArea) {
      state.placements[itemId] = targetArea;
      renderTokens();
      notifyChange();
    }

    function createToken(item) {
      const token = createElement("button", "token", item.label);
      token.type = "button";
      token.draggable = true;
      token.title = "拖到对应栏目，或直接点击切换栏目";
      token.addEventListener("click", function () {
        moveItem(item.id, nextArea(state.placements[item.id]));
      });
      token.addEventListener("dragstart", function (event) {
        draggingItemId = item.id;
        token.classList.add("is-dragging");
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
      });
      token.addEventListener("dragend", function () {
        draggingItemId = "";
        token.classList.remove("is-dragging");
      });
      return token;
    }

    function renderTokens() {
      Object.keys(columns).forEach(function (areaKey) {
        columns[areaKey].replaceChildren();
      });
      question.items.forEach(function (item) {
        const targetArea = state.placements[item.id] || "bank";
        columns[targetArea].appendChild(createToken(item));
      });
    }

    renderTokens();
    card.appendChild(layout);

    return {
      prompt: question.prompt,
      element: card,
      isComplete: function () {
        return question.items.every(function (item) {
          return state.placements[item.id] !== "bank";
        });
      },
      isCorrect: function () {
        return question.items.every(function (item) {
          return state.placements[item.id] === item.category;
        });
      },
      getSummary: function () {
        return question.categories.map(function (category) {
          const labels = question.items.filter(function (item) {
            return state.placements[item.id] === category.id;
          }).map(function (item) {
            return item.label;
          });
          return category.label + "：" + (labels.length ? labels.join("、") : "无");
        }).join("；");
      },
      reset: function () {
        question.items.forEach(function (item) {
          state.placements[item.id] = "bank";
        });
        renderTokens();
      }
    };
  }

  function buildSortQuestion(question, index, notifyChange) {
    const initialOrder = (question.startOrder && question.startOrder.length)
      ? question.startOrder.slice()
      : question.answer.slice().reverse();
    const state = {
      order: initialOrder.slice(),
      touched: false
    };
    let draggingItemId = "";

    const labelLookup = {};
    question.items.forEach(function (item) {
      labelLookup[item.id] = item.label;
    });

    const card = createQuestionShell(question, index, "排序题");
    const layout = createElement("div", "sort-layout");
    const list = createElement("ol", "sort-list");

    function moveItem(itemId, targetIndex) {
      const currentIndex = state.order.indexOf(itemId);
      if (currentIndex === -1 || currentIndex === targetIndex) {
        return;
      }
      state.order.splice(currentIndex, 1);
      state.order.splice(targetIndex, 0, itemId);
      state.touched = true;
      renderList();
      notifyChange();
    }

    function stepMove(itemId, offset) {
      const currentIndex = state.order.indexOf(itemId);
      const targetIndex = currentIndex + offset;
      if (targetIndex < 0 || targetIndex >= state.order.length) {
        return;
      }
      moveItem(itemId, targetIndex);
    }

    function createSortItem(itemId, indexInList) {
      const item = createElement("li", "sort-item");
      item.draggable = true;

      item.addEventListener("dragstart", function (event) {
        draggingItemId = itemId;
        item.classList.add("is-dragging");
        event.dataTransfer.setData("text/plain", itemId);
        event.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragend", function () {
        draggingItemId = "";
        item.classList.remove("is-dragging");
      });

      item.addEventListener("dragover", function (event) {
        event.preventDefault();
      });

      item.addEventListener("drop", function (event) {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData("text/plain") || draggingItemId;
        if (!draggedId) {
          return;
        }
        moveItem(draggedId, indexInList);
      });

      const handle = createElement("div", "sort-handle", "::");
      const text = createElement("div", "sort-text", labelLookup[itemId]);
      const actions = createElement("div", "sort-actions");
      const upButton = createElement("button", "icon-btn", "上移");
      const downButton = createElement("button", "icon-btn", "下移");
      upButton.type = "button";
      downButton.type = "button";
      upButton.disabled = indexInList === 0;
      downButton.disabled = indexInList === state.order.length - 1;
      upButton.addEventListener("click", function () {
        stepMove(itemId, -1);
      });
      downButton.addEventListener("click", function () {
        stepMove(itemId, 1);
      });
      actions.appendChild(upButton);
      actions.appendChild(downButton);

      item.appendChild(handle);
      item.appendChild(text);
      item.appendChild(actions);
      return item;
    }

    function renderList() {
      replaceChildren(
        list,
        state.order.map(function (itemId, orderIndex) {
          return createSortItem(itemId, orderIndex);
        })
      );
    }

    renderList();
    layout.appendChild(list);
    card.appendChild(layout);

    return {
      prompt: question.prompt,
      element: card,
      isComplete: function () {
        return state.touched;
      },
      isCorrect: function () {
        return arraysEqual(state.order, question.answer);
      },
      getSummary: function () {
        return state.order.map(function (itemId) {
          return labelLookup[itemId];
        }).join(" -> ");
      },
      reset: function () {
        state.order = initialOrder.slice();
        state.touched = false;
        renderList();
      }
    };
  }

  function buildDiscussionQuestion(question, index, notifyChange) {
    const state = { value: "" };
    const card = createQuestionShell(question, index, "思考讨论");
    const box = createElement("div", "discussion-box");
    const textarea = createElement("textarea", "discussion-input");
    textarea.placeholder = question.placeholder || "请输入你的想法";
    textarea.rows = question.rows || 6;
    textarea.addEventListener("input", function () {
      state.value = textarea.value;
      notifyChange();
    });

    box.appendChild(textarea);
    box.appendChild(createElement("div", "discussion-note", question.note || "这道题不计分，只展示你的作答结果。"));
    card.appendChild(box);

    return {
      prompt: question.prompt,
      element: card,
      isScored: false,
      isComplete: function () {
        return state.value.trim().length > 0;
      },
      isCorrect: function () {
        return true;
      },
      getSummary: function () {
        return state.value.trim() || "未作答";
      },
      reset: function () {
        state.value = "";
        textarea.value = "";
      }
    };
  }

  function createQuestionShell(question, index, typeLabel) {
    const card = createElement("article", "question-card");
    card.style.setProperty("--delay", index * 0.05 + "s");

    const head = createElement("div", "question-head");
    const left = createElement("div");
    const indexTag = createElement("div", "q-index", String(index + 1));
    const prompt = createElement("p", "prompt", question.prompt);
    if (question.tip) {
      left.appendChild(prompt);
      left.appendChild(createElement("p", "question-tip", question.tip));
    } else {
      left.appendChild(prompt);
    }
    head.appendChild(indexTag);
    head.appendChild(createElement("div", "q-type", typeLabel));

    card.appendChild(head);
    card.appendChild(left);
    return card;
  }

  function buildQuestionController(question, index, notifyChange) {
    if (question.type === "single") {
      return buildSingleQuestion(question, index, notifyChange);
    }
    if (question.type === "multi") {
      return buildMultiQuestion(question, index, notifyChange);
    }
    if (question.type === "categorize") {
      return buildCategorizeQuestion(question, index, notifyChange);
    }
    if (question.type === "sort") {
      return buildSortQuestion(question, index, notifyChange);
    }
    if (question.type === "discussion") {
      return buildDiscussionQuestion(question, index, notifyChange);
    }
    throw new Error("Unsupported question type: " + question.type);
  }

  function init(config) {
    applyTheme(config.theme);
    document.title = (config.lessonLabel ? config.lessonLabel + "：" : "") + config.title;

    const heroKicker = document.getElementById("hero-kicker");
    const heroTitle = document.getElementById("hero-title");
    const heroSummary = document.getElementById("hero-summary");
    const heroChips = document.getElementById("hero-chips");
    const heroSide = document.getElementById("hero-side");
    const topMeta = document.getElementById("top-meta");
    const overviewGrid = document.getElementById("overview-grid");
    const spotlightGrid = document.getElementById("spotlight-grid");
    const resourcesGrid = document.getElementById("resources-grid");
    const questionList = document.getElementById("question-list");
    const progressText = document.getElementById("progress-text");
    const progressFill = document.getElementById("progress-fill");
    const completionNote = document.getElementById("completion-note");
    const submitButton = document.getElementById("submit-btn");
    const resetButton = document.getElementById("reset-btn");
    const resultModal = document.getElementById("result-modal");
    const modalTitleText = document.getElementById("modal-title-text");
    const resultLesson = document.getElementById("result-lesson");
    const resultQuestions = document.getElementById("result-questions");
    const resultStatus = document.getElementById("result-status");
    const resultScore = document.getElementById("result-score");
    const resultStatusText = document.getElementById("result-status-text");
    const resultStatusNote = document.getElementById("result-status-note");
    const modalClose = document.getElementById("modal-close");
    const resourceDesc = document.getElementById("resource-desc");

    if (heroKicker) {
      heroKicker.textContent = config.heroKicker || "交互课件";
    }
    if (heroTitle) {
      heroTitle.textContent = (config.lessonLabel ? config.lessonLabel + "：" : "") + config.title;
    }
    if (heroSummary) {
      heroSummary.textContent = config.summary;
    }
    renderChips(heroChips, config.heroChips || []);
    renderChips(topMeta, config.topMeta || []);
    renderTextCards(heroSide, config.heroCards || [], "mini-card");
    renderTextCards(overviewGrid, config.overviewCards || [], "info-card");
    renderTextCards(spotlightGrid, config.spotlightCards || [], "spotlight-card");
    renderResources(resourcesGrid, config.resources || []);
    if (resourceDesc && config.resourceDesc) {
      resourceDesc.textContent = config.resourceDesc;
    }

    const controllers = config.questions.map(function (question, index) {
      return buildQuestionController(question, index, updateProgress);
    });
    replaceChildren(questionList, controllers.map(function (controller) {
      return controller.element;
    }));

    function updateProgress() {
      const completed = controllers.filter(function (controller) {
        return controller.isComplete();
      }).length;
      const total = controllers.length;
      const percent = total ? (completed / total) * 100 : 0;
      const completeAll = completed === total;

      if (progressText) {
        progressText.textContent = "已完成 " + completed + " / " + total + " 题";
      }
      if (progressFill) {
        progressFill.style.width = percent + "%";
      }
      if (completionNote) {
        completionNote.textContent = completeAll
          ? "所有题目已完成，现在可以统一提交。"
          : "还差 " + (total - completed) + " 题，完成后才能提交。";
      }
      if (submitButton) {
        submitButton.disabled = !completeAll;
      }
    }

    function buildSummaryData() {
      const scoredControllers = controllers.filter(function (controller) {
        return controller.isScored !== false;
      });
      const earnedScore = scoredControllers.reduce(function (sum, controller) {
        return sum + (controller.isCorrect() ? 10 : 0);
      }, 0);
      const totalScore = scoredControllers.length * 10;
      const allCorrect = scoredControllers.every(function (controller) {
        return controller.isCorrect();
      });
      return {
        lessonTitle: (config.lessonLabel ? config.lessonLabel + "-" : "") + config.title,
        items: controllers.map(function (controller, index) {
          return {
            index: index + 1,
            prompt: controller.prompt,
            answer: controller.getSummary()
          };
        }),
        scoredCount: scoredControllers.length,
        earnedScore: earnedScore,
        totalScore: totalScore,
        allCorrect: allCorrect
      };
    }

    function showModal(summary) {
      if (!resultModal || !modalTitleText || !resultLesson || !resultQuestions || !resultStatus || !resultScore || !resultStatusText || !resultStatusNote) {
        return;
      }
      modalTitleText.textContent = summary.lessonTitle;
      resultLesson.textContent = "你的作答如下";
      replaceChildren(
        resultQuestions,
        summary.items.map(function (item) {
          const card = createElement("article", "result-card");
          const prompt = createElement("p", "result-question", item.index + ". " + item.prompt);
          const answer = createElement("p", "result-answer");
          const strong = createElement("strong", "", "你的答案：");
          answer.appendChild(strong);
          answer.appendChild(document.createTextNode(item.answer));
          card.appendChild(prompt);
          card.appendChild(answer);
          return card;
        })
      );
      resultStatus.className = "result-status " + (summary.allCorrect ? "is-success" : "is-error");
      resultScore.textContent = summary.earnedScore + " / " + summary.totalScore;
      resultStatusText.textContent = summary.allCorrect ? "完全正确" : "还有错误";
      resultStatusNote.textContent = summary.allCorrect
        ? summary.scoredCount + " 道评分题全部答对，思考讨论题也已记录。"
        : "评分题得分如上，思考讨论题也已记录。";
      resultModal.hidden = false;
      document.body.style.overflow = "hidden";
    }

    function hideModal() {
      if (!resultModal) {
        return;
      }
      resultModal.hidden = true;
      document.body.style.overflow = "";
    }

    if (submitButton) {
      submitButton.addEventListener("click", function () {
        if (submitButton.disabled) {
          return;
        }
        showModal(buildSummaryData());
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        controllers.forEach(function (controller) {
          controller.reset();
        });
        updateProgress();
      });
    }

    if (modalClose) {
      modalClose.addEventListener("click", hideModal);
    }

    if (resultModal) {
      resultModal.addEventListener("click", function (event) {
        if (event.target === resultModal) {
          hideModal();
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && resultModal && !resultModal.hidden) {
        hideModal();
      }
    });

    updateProgress();
  }

  window.CourseApp = {
    init: init
  };
})();
