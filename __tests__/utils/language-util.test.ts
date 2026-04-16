import { inferLanguage } from '../../src/utils/language-util';

describe('inferLanguage', () => {
  describe('完整文件路径输入', () => {
    it('应正确推断 TypeScript 文件', () => {
      expect(inferLanguage('src/app.ts')).toBe('typescript');
      expect(inferLanguage('components/Button.tsx')).toBe('typescript');
    });

    it('应正确推断 JavaScript 文件', () => {
      expect(inferLanguage('src/index.js')).toBe('javascript');
      expect(inferLanguage('components/App.jsx')).toBe('javascript');
    });

    it('应正确推断 ES Module 和 CommonJS 文件', () => {
      expect(inferLanguage('lib/utils.mjs')).toBe('javascript');
      expect(inferLanguage('lib/config.cjs')).toBe('javascript');
    });

    it('应正确推断 Python 文件', () => {
      expect(inferLanguage('app.py')).toBe('python');
      expect(inferLanguage('types.pyi')).toBe('python');
    });

    it('应正确推断 Java 文件', () => {
      expect(inferLanguage('Main.java')).toBe('java');
    });

    it('应正确推断 Go 文件', () => {
      expect(inferLanguage('main.go')).toBe('go');
    });

    it('应正确推断 Ruby 文件', () => {
      expect(inferLanguage('app.rb')).toBe('ruby');
    });

    it('应正确推断 Rust 文件', () => {
      expect(inferLanguage('main.rs')).toBe('rust');
    });

    it('应正确推断 C/C++ 文件', () => {
      expect(inferLanguage('main.c')).toBe('c');
      expect(inferLanguage('header.h')).toBe('c');
      expect(inferLanguage('main.cpp')).toBe('cpp');
      expect(inferLanguage('lib.cc')).toBe('cpp');
      expect(inferLanguage('types.hpp')).toBe('cpp');
    });

    it('应正确推断 C# 文件', () => {
      expect(inferLanguage('Program.cs')).toBe('csharp');
    });

    it('应正确推断 PHP 文件', () => {
      expect(inferLanguage('index.php')).toBe('php');
    });

    it('应正确推断 Swift 文件', () => {
      expect(inferLanguage('App.swift')).toBe('swift');
    });

    it('应正确推断 Kotlin 文件', () => {
      expect(inferLanguage('Main.kt')).toBe('kotlin');
    });

    it('应正确推断 SQL 文件', () => {
      expect(inferLanguage('schema.sql')).toBe('sql');
    });

    it('应正确推断数据/配置格式', () => {
      expect(inferLanguage('data.json')).toBe('json');
      expect(inferLanguage('config.yaml')).toBe('yaml');
      expect(inferLanguage('config.yml')).toBe('yaml');
      expect(inferLanguage('layout.xml')).toBe('xml');
    });

    it('应正确推断标记和样式文件', () => {
      expect(inferLanguage('index.html')).toBe('html');
      expect(inferLanguage('README.md')).toBe('markdown');
      expect(inferLanguage('style.css')).toBe('css');
      expect(inferLanguage('theme.scss')).toBe('scss');
      expect(inferLanguage('vars.less')).toBe('less');
    });

    it('应正确推断 Shell 文件', () => {
      expect(inferLanguage('deploy.sh')).toBe('bash');
      expect(inferLanguage('build.bash')).toBe('bash');
    });
  });

  describe('带点号的扩展名输入', () => {
    it('应正确处理 .ts 格式', () => {
      expect(inferLanguage('.ts')).toBe('typescript');
    });

    it('应正确处理 .js 格式', () => {
      expect(inferLanguage('.js')).toBe('javascript');
    });

    it('应正确处理 .mjs 格式', () => {
      expect(inferLanguage('.mjs')).toBe('javascript');
    });

    it('应正确处理 .cjs 格式', () => {
      expect(inferLanguage('.cjs')).toBe('javascript');
    });

    it('应正确处理 .sh 格式', () => {
      expect(inferLanguage('.sh')).toBe('bash');
    });

    it('应正确处理 .md 格式', () => {
      expect(inferLanguage('.md')).toBe('markdown');
    });

    it('应正确处理 .py 格式', () => {
      expect(inferLanguage('.py')).toBe('python');
    });
  });

  describe('不带点号的扩展名输入', () => {
    it('应正确处理 ts 格式', () => {
      expect(inferLanguage('ts')).toBe('typescript');
    });

    it('应正确处理 js 格式', () => {
      expect(inferLanguage('js')).toBe('javascript');
    });

    it('应正确处理 mjs 格式', () => {
      expect(inferLanguage('mjs')).toBe('javascript');
    });

    it('应正确处理 cjs 格式', () => {
      expect(inferLanguage('cjs')).toBe('javascript');
    });

    it('应正确处理 py 格式', () => {
      expect(inferLanguage('py')).toBe('python');
    });

    it('应正确处理 sh 格式', () => {
      expect(inferLanguage('sh')).toBe('bash');
    });

    it('应正确处理 md 格式', () => {
      expect(inferLanguage('md')).toBe('markdown');
    });
  });

  describe('边界情况', () => {
    it('空字符串应返回 text', () => {
      expect(inferLanguage('')).toBe('text');
    });

    it('无扩展名的文件名应返回文件名本身', () => {
      expect(inferLanguage('Makefile')).toBe('makefile');
    });

    it('未知扩展名应返回扩展名本身', () => {
      expect(inferLanguage('file.xyz')).toBe('xyz');
    });

    it('大小写不敏感', () => {
      expect(inferLanguage('file.TS')).toBe('typescript');
      expect(inferLanguage('file.Py')).toBe('python');
      expect(inferLanguage('file.JS')).toBe('javascript');
    });

    it('深层路径应正确推断', () => {
      expect(inferLanguage('src/components/ui/Button.tsx')).toBe('typescript');
      expect(inferLanguage('/absolute/path/to/file.py')).toBe('python');
    });

    it('多个点号应取最后一个扩展名', () => {
      expect(inferLanguage('file.test.ts')).toBe('typescript');
      expect(inferLanguage('data.backup.json')).toBe('json');
    });
  });
});
