import { GitDiffCollector } from '../../src/input/git-diff-collector';

describe('GitDiffCollector', () => {
  let collector: GitDiffCollector;

  beforeEach(() => {
    collector = new GitDiffCollector();
  });

  describe('parseDiff', () => {
    it('should parse diff with pure additions', () => {
      // 纯新增行的 diff
      const diffOutput = `diff --git a/hello.ts b/hello.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/hello.ts
@@ -0,0 +1,5 @@
+function hello() {
+  console.log('hello');
+  console.log('world');
+  return true;
+}
`;

      const hunks = collector.parseDiff(diffOutput);
      expect(hunks).toHaveLength(1);
      expect(hunks[0].file).toBe('hello.ts');
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newCount).toBe(5);
      expect(hunks[0].oldStart).toBe(0);
      expect(hunks[0].oldCount).toBe(0);

      // 所有行应为 add 类型
      const addLines = hunks[0].lines.filter(l => l.type === 'add');
      expect(addLines).toHaveLength(5);
      expect(addLines[0].content).toBe("function hello() {");
      expect(addLines[4].content).toBe("}");

      // 验证转换为 FileToReview
      const files = collector.hunksToFileToReview(hunks);
      expect(files).toHaveLength(1);
      expect(files[0].diff).toContain('@@ -0,0 +1,5 @@');
      expect(files[0].diff).toContain("+function hello() {");
    });

    it('should parse diff with pure deletions', () => {
      // 纯删除行的 diff
      const diffOutput = `diff --git a/old.ts b/old.ts
index abc1234..0000000
--- a/old.ts
+++ b/old.ts
@@ -1,4 +1,0 @@
-function deprecated() {
-  console.log('removing');
-  return false;
-}
`;

      const hunks = collector.parseDiff(diffOutput);
      expect(hunks).toHaveLength(1);
      expect(hunks[0].file).toBe('old.ts');
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[0].oldCount).toBe(4);
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newCount).toBe(0);

      // 所有行应为 remove 类型
      const removeLines = hunks[0].lines.filter(l => l.type === 'remove');
      expect(removeLines).toHaveLength(4);
      expect(removeLines[0].content).toBe("function deprecated() {");
      expect(removeLines[2].content).toBe("  return false;");
    });

    it('should parse diff with mixed changes (additions and deletions in same hunk)', () => {
      // 同一 hunk 中混合新增和删除
      const diffOutput = `diff --git a/app.ts b/app.ts
index abc1234..def5678 100644
--- a/app.ts
+++ b/app.ts
@@ -5,7 +5,8 @@
 import { Config } from './config';

 function main() {
-  const old = 'hello';
-  console.log(old);
+  const updated = 'world';
+  console.log(updated);
+  console.log('extra line');
   return true;
 }
`;

      const hunks = collector.parseDiff(diffOutput);
      expect(hunks).toHaveLength(1);
      expect(hunks[0].file).toBe('app.ts');
      // 验证行号范围与原始 @@ header 一致
      expect(hunks[0].oldStart).toBe(5);
      expect(hunks[0].oldCount).toBe(7);
      expect(hunks[0].newStart).toBe(5);
      expect(hunks[0].newCount).toBe(8);

      const addLines = hunks[0].lines.filter(l => l.type === 'add');
      const removeLines = hunks[0].lines.filter(l => l.type === 'remove');
      const contextLines = hunks[0].lines.filter(l => l.type === 'context');

      expect(addLines).toHaveLength(3);
      expect(removeLines).toHaveLength(2);
      expect(contextLines).toHaveLength(4);
    });

    it('should parse diff with multiple files', () => {
      // 多文件 diff
      const diffOutput = `diff --git a/src/utils.ts b/src/utils.ts
index abc1234..def5678 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number) {
+  // 新增注释
   return a + b;
 }
diff --git a/src/main.py b/src/main.py
index 111111..222222 100644
--- a/src/main.py
+++ b/src/main.py
@@ -1,2 +1,3 @@
 def greet():
+    print("hello")
     pass
diff --git a/src/styles.css b/src/styles.css
new file mode 100644
index 0000000..333333
--- /dev/null
+++ b/src/styles.css
@@ -0,0 +1,3 @@
+body {
+  margin: 0;
+}
`;

      const hunks = collector.parseDiff(diffOutput);
      const files = collector.hunksToFileToReview(hunks);

      // 应当生成 3 个独立的 FileToReview
      expect(files).toHaveLength(3);

      // 验证每个文件独立输出
      const utilsFile = files.find(f => f.path === 'src/utils.ts');
      const mainFile = files.find(f => f.path === 'src/main.py');
      const cssFile = files.find(f => f.path === 'src/styles.css');

      expect(utilsFile).toBeDefined();
      expect(mainFile).toBeDefined();
      expect(cssFile).toBeDefined();

      // 验证 language 字段根据扩展名正确推断
      expect(utilsFile!.language).toBe('typescript');
      expect(mainFile!.language).toBe('python');
      expect(cssFile!.language).toBe('css');

      // 验证每个文件包含正确的 diff 内容
      expect(utilsFile!.diff).toContain('+  // 新增注释');
      expect(mainFile!.diff).toContain('+    print("hello")');
      expect(cssFile!.diff).toContain('+body {');
    });

    it('should handle empty diff', () => {
      const hunks = collector.parseDiff('');
      expect(hunks).toHaveLength(0);
    });

    it('should handle diff with multiple hunks in same file', () => {
      const diffOutput = `diff --git a/file.ts b/file.ts
index abc..def 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line1
+new line near top
 line2
 line3
@@ -20,3 +21,4 @@
 line20
+new line near bottom
 line21
 line22
`;

      const hunks = collector.parseDiff(diffOutput);
      expect(hunks).toHaveLength(2);
      expect(hunks[0].file).toBe('file.ts');
      expect(hunks[1].file).toBe('file.ts');
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[1].newStart).toBe(21);

      // 合并到 FileToReview 后应只有一个文件
      const files = collector.hunksToFileToReview(hunks);
      expect(files).toHaveLength(1);
      expect(files[0].diff).toContain('+new line near top');
      expect(files[0].diff).toContain('+new line near bottom');
    });
  });

  describe('language inference', () => {
    it('should correctly infer language for various extensions', () => {
      const diffOutput = `diff --git a/file.go b/file.go
index aaa..bbb 100644
--- a/file.go
+++ b/file.go
@@ -1,1 +1,2 @@
 package main
+// comment
`;

      const hunks = collector.parseDiff(diffOutput);
      const files = collector.hunksToFileToReview(hunks);
      expect(files[0].language).toBe('go');
    });
  });

  describe('collect', () => {
    it('should support custom context lines', () => {
      const collector30 = new GitDiffCollector(30);
      const collector100 = new GitDiffCollector(100);

      expect(collector30).toBeDefined();
      expect(collector100).toBeDefined();
    });
  });
});
