---
name: UI设计
description: 为应用设计现代化、美观的用户界面，提供设计方案和代码实现
---

# UI设计技能

## 使用场景
- 新增功能需要 UI 设计
- 现有界面需要美化
- 需要设计组件样式

## 设计原则

### 1. 现代美学
- 使用渐变色创造层次感
- 适当的圆角（8-16px）
- 柔和的阴影（多层阴影更自然）
- 玻璃拟态效果增加高级感

### 2. 色彩规范
```css
/* 主色调 - 紫蓝渐变 */
--primary: linear-gradient(135deg, #6366f1, #8b5cf6);

/* 成功/错误/警告 */
--success: #10b981;
--error: #ef4444;
--warning: #f59e0b;

/* 中性色 */
--gray-50: #f8fafc;
--gray-900: #0f172a;
```

### 3. 间距系统
- 4px 基准网格
- 常用间距：4, 8, 12, 16, 24, 32, 48, 64

### 4. 动效指南
- 过渡时长：150-300ms
- 缓动函数：ease-out 为主
- 微交互提升体验感

## 设计流程

1. **理解需求** - 功能目标、目标用户
2. **参考灵感** - 现代 UI 设计趋势
3. **输出设计** - 描述 + 代码实现
4. **迭代优化** - 根据反馈调整

## 组件设计模板

### 按钮
```jsx
<button className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 
    text-white font-medium rounded-lg shadow-lg shadow-indigo-200 
    hover:from-indigo-600 hover:to-purple-600 
    transition-all duration-200 active:scale-95">
    按钮文字
</button>
```

### 卡片
```jsx
<div className="p-6 bg-white rounded-2xl shadow-xl border border-slate-100
    hover:shadow-2xl transition-shadow duration-300">
    {/* 内容 */}
</div>
```

### 输入框
```jsx
<input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 
    rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 
    focus:border-indigo-300 transition-all" />
```

## 输出格式

```markdown
# UI 设计方案 - [功能名]

## 🎨 设计概述
简述设计思路和视觉风格

## 📐 布局结构
描述整体布局

## 🖼️ 设计效果
（可用 generate_image 生成预览图）

## 💻 代码实现
完整的 React + Tailwind 代码
```

## 注意事项
- 优先使用 Tailwind CSS
- 遵循项目现有设计风格
- 确保响应式兼容
- 使用中文输出
