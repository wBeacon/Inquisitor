---
# Claude-Forever Harness Context

This project is managed by claude-forever, an autonomous coding harness.
**IMPORTANT files to read at the start of each session:**
- `claude-progress.txt` — session-by-session progress log (READ first, APPEND when done)
- `git log --oneline -10` — recent commit history

**Goal:** Build a high-intensity code review tool that systematically tries to prove code is wrong from multiple angles until it can't find any more flaws. Inspired by SWE-bench champion verification patterns (Devin, OpenHands).

**Key Architecture:**
- 5 independent dimension agents (Logic, Security, Performance, Maintainability, EdgeCases) running in parallel
- Adversarial review agent that challenges findings and identifies false positives
- Confidence-based calibration system
- Complete API isolation to prevent context contamination

**Project Status: ✅ COMPLETE**
- [x] Feature #1: Project scaffolding & core types
- [x] Feature #2: Input collection layer (Git diff, files, context enrichment)
- [x] Feature #3: Dimension Agent system (5 agents, Claude API integration)
- [x] Feature #4: Adversary Agent & confidence calibration
- [x] Feature #5: Orchestrator (parallel execution, timeouts, error handling)
- [x] Feature #6: Report generation (JSON + Markdown)
- [x] Feature #7: Claude Code Skill integration

**Current Status:**
- Tests: 156/156 passing ✅
- TypeScript errors: 0 ✅
- Code: 3,534 lines
- Documentation: 15+ comprehensive guides

**Recent Work:**
- Session 9: Completed Feature #3 with real Claude API integration (141 tests)
- Session 10: Completed Feature #4 with AdversaryAgent and IssueCalibrator (156 tests)
- Final: Created comprehensive project status documentation

**Rules:**
- Do NOT remove or weaken existing tests
- Self-verify all features before considering them done
- Commit with descriptive messages
- Append progress summary to claude-progress.txt before exiting

**For next developer:**
The project is production-ready. Potential enhancements:
1. AST-based analysis for deeper code understanding
2. CI/CD pipeline integration
3. Result caching layer
4. ML-based confidence calibration
5. Browser-based report viewer
6. Custom dimension plugins
