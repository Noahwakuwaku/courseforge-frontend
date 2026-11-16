export function demoContent(name) {
  return {
    outline: { title: name, description: '以清晰的概念、具体案例和可执行的练习建立理解。', prerequisites: ['基本的逻辑思维'], learning_outcomes: ['解释核心概念及其适用边界', '用一个真实案例完成分析'], sections: [{ title: '从问题开始', content: '建立背景与学习目标。', key_points: ['问题定义', '适用场景'] }, { title: '理解并应用', content: '通过案例与练习连接概念。', key_points: ['关键概念', '实践方法'] }] },
    material: { course_title: name, sections: [{ title: '从一个好问题开始', body: `## 学习目标\n学习「${name}」时，先明确我们希望解决什么问题，再选择适合的方法。\n\n**一个具体的起点**\n\n想象你正在为一个内容平台设计新的课程板块。用户需要的可能不是更多文章，而是一条从入门到实践的学习路径。\n\n- 明确面向谁：已有知识、使用场景与时间限制。\n- 明确完成后能做什么：把抽象目标转化为可观察的行动。\n- 明确如何验证：用练习或案例检验理解。\n\n> 好的学习目标，能够指导内容取舍，也能够指导验收。`, summary: '先定义问题，再选择方法。课程内容应当始终服务于学习目标。' }, { title: '把理解转化为实践', body: '## 小练习\n选择一个你熟悉的主题，用三个步骤设计一段学习体验。\n\n1. 写下目标读者和一个明确的问题。\n2. 给出一个能够说明概念的案例。\n3. 设计一道检查理解的题目。\n\n完成后检查：案例是否真的支持观点？练习是否超出了前面讲解的内容？\n\n**反思**\n如果读者没有达到预期，优先检查解释和前置知识，而不是简单增加篇幅。', summary: '解释、案例与练习应形成一致的结构。' }] },
    questions: [{ question: '设计课程时，首先应该确认什么？', options: { A: '尽可能多的章节数量', B: '目标读者与学习目标', C: '页面的动画效果', D: '最终文章的字数' }, correct_answers: ['B'], explanation: '明确读者和目标，才能判断知识范围、难度与内容取舍。', difficulty: 'easy' }, { question: '哪些做法有助于检验课程质量？（多选）', options: { A: '检查前置知识', B: '核对案例与结论', C: '只关注生成字数', D: '验证练习与讲解的一致性' }, correct_answers: ['A', 'B', 'D'], explanation: '质量检查需要覆盖结构、正确性和目标一致性。', difficulty: 'medium' }],
  }
}
export function createDemoSnapshot() {
  const names = ['理解用户与真实需求', '问题定义与机会识别', '构建清晰的信息架构', '交互流程与反馈设计', '原型验证与可用性测试', '从设计到产品交付']
  const courses = names.map((name, i) => ({ _id: `demo-course-${i}`, name, has_subcategories: false, status: i < 3 ? 'outline_done' : 'pending' }))
  const outlines = {}, materials = {}, exams = {}
  courses.slice(0, 4).forEach((c, i) => {
    const content = demoContent(c.name), lid = `demo-lecture-${c._id}`, mid = `demo-material-${c._id}`
    outlines[`course:${c._id}`] = { lectureId: lid, ...content.outline }
    if (i < 2) materials[lid] = { materialId: mid, ...content.material }
    if (i === 0) exams[mid] = content.questions
  })
  return { subject: { _id: 'demo-subject', name: '产品设计基础' }, courses, outlines, materials, exams }
}
