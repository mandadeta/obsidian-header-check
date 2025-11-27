const { Plugin, TFile, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  includeRoots: [],
  excludeRoots: []
};

class HeaderCheckPlugin extends Plugin {
  async onload() {
    const data = (await this.loadData()) || {};
    this.headerDone = data.headerDone || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});

    this.addSettingTab(new HeaderCheckSettingTab(this.app, this));

    this.addCommand({
      id: 'toggle-header-done',
      name: 'Toggle heading done',
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) return;
        if (!this.isPathEnabled(file.path)) return;

        const line = editor.getCursor().line;
        this.toggleHeading(file.path, line);
      }
    });

    this.registerMarkdownPostProcessor((el, ctx) => {
      const path = ctx.sourcePath;
      if (!this.isPathEnabled(path)) return;

      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;

      const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');

      headings.forEach((headingEl) => {
        const info = ctx.getSectionInfo(headingEl);
        if (!info) return;

        const line = info.lineStart;

        if (headingEl.querySelector('.header-done-checkbox')) return;

        const done = this.isHeadingDone(path, line);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'header-done-checkbox';
        if (done) button.classList.add('is-checked');
        button.textContent = done ? '✓' : '';
        button.setAttribute('aria-label', 'Toggle heading done');

        const stopAll = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === 'function') {
            ev.stopImmediatePropagation();
          }
        };

        button.addEventListener('mousedown', stopAll, true);
        button.addEventListener('click', (ev) => {
          stopAll(ev);
          const p = this.toggleHeading(path, line);
          Promise.resolve(p).then((newState) => {
            button.classList.toggle('is-checked', newState);
            button.textContent = newState ? '✓' : '';
          });
        });

        headingEl.classList.add('header-has-checkbox');

        const collapseEl = headingEl.querySelector(
          '.heading-collapse-indicator, .collapse-indicator'
        );

        if (collapseEl) {
          let proxy = headingEl.querySelector('.header-done-arrow-proxy');
          if (!proxy) {
            proxy = document.createElement('span');
            proxy.className = 'header-done-arrow-proxy';
            collapseEl.insertAdjacentElement('afterend', proxy);
          }
          proxy.insertAdjacentElement('afterend', button);
        } else {
          headingEl.insertBefore(button, headingEl.firstChild);
        }
      });
    });
  }

  onunload() {}

  async savePluginData() {
    await this.saveData({
      headerDone: this.headerDone,
      settings: this.settings
    });
  }

  normalizeRoot(root) {
    return root.trim().replace(/^\/+|\/+$/g, '');
  }

  pathMatchesRoot(path, rawRoot) {
    const root = this.normalizeRoot(rawRoot);
    if (!root) return false;

    const p = path.replace(/^\/+/, '');
    if (p === root) return true;
    if (p.startsWith(root + '/')) return true;
    return false;
  }

  isPathEnabled(path) {
    const rel = path.replace(/^\/+/, '');
    const { includeRoots, excludeRoots } = this.settings;

    if (includeRoots && includeRoots.length > 0) {
      let ok = false;
      for (const r of includeRoots) {
        if (this.pathMatchesRoot(rel, r)) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }

    if (excludeRoots && excludeRoots.length > 0) {
      for (const r of excludeRoots) {
        if (this.pathMatchesRoot(rel, r)) {
          return false;
        }
      }
    }

    return true;
  }

  isHeadingDone(path, line) {
    const fileMap = this.headerDone[path];
    return !!(fileMap && fileMap[line]);
  }

  async toggleHeading(path, line) {
    if (!this.headerDone[path]) this.headerDone[path] = {};

    const prev = !!this.headerDone[path][line];
    const next = !prev;

    if (next) {
      this.headerDone[path][line] = true;
    } else {
      delete this.headerDone[path][line];
    }

    await this.savePluginData();
    return next;
  }
}

class HeaderCheckSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Header Check' });

    new Setting(containerEl)
      .setName('Only enable in these folders/files')
      .setDesc(
        'One path per line, e.g. "Questions/" or "Study/". Leave empty to enable everywhere (except excluded below).'
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('Questions/\nStudy/')
          .setValue((this.plugin.settings.includeRoots || []).join('\n'))
          .onChange(async (value) => {
            const roots = value
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            this.plugin.settings.includeRoots = roots;
            await this.plugin.savePluginData();
          });
      });

    new Setting(containerEl)
      .setName('Exclude these folders/files')
      .setDesc(
        'One path per line. Notes in these paths will never get header checkboxes.'
      )
      .addTextArea((text) => {
        text
          .setPlaceholder('Archive/\nOldNotes/')
          .setValue((this.plugin.settings.excludeRoots || []).join('\n'))
          .onChange(async (value) => {
            const roots = value
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            this.plugin.settings.excludeRoots = roots;
            await this.plugin.savePluginData();
          });
      });
  }
}

module.exports = HeaderCheckPlugin;
