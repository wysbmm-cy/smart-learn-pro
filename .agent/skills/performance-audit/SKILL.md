---
name: 性能分析
description: 分析React组件和应用的性能问题，提供优化建议
---

# 性能分析技能

## 使用场景
- 页面加载缓慢
- 滚动卡顿
- 内存占用过高
- 打包体积过大

## 分析流程

### 1. 渲染性能分析
- [ ] 检查不必要的重渲染
- [ ] 检查缺失的 memo/useMemo/useCallback
- [ ] 检查列表是否有 key
- [ ] 检查大列表是否需要虚拟化

### 2. 内存分析
- [ ] 检查未清理的副作用（useEffect cleanup）
- [ ] 检查事件监听器是否正确移除
- [ ] 检查定时器是否正确清理
- [ ] 检查大对象是否被持续引用

### 3. 网络性能
- [ ] 检查 API 调用是否有不必要的重复
- [ ] 检查是否使用了缓存策略
- [ ] 检查图片是否优化
- [ ] 检查懒加载是否正确使用

### 4. 打包体积分析
- [ ] 检查未使用的依赖
- [ ] 检查是否有重复的库
- [ ] 检查是否需要代码拆分
- [ ] 检查是否有过大的单文件

## 常见问题模式

```javascript
// ⛔ 不好的模式 - 每次渲染创建新函数
<Button onClick={() => handleClick(id)} />

// ✅ 好的模式 - 使用 useCallback
const handleButtonClick = useCallback(() => handleClick(id), [id]);
<Button onClick={handleButtonClick} />

// ⛔ 不好的模式 - 缺少 cleanup
useEffect(() => {
    const interval = setInterval(tick, 1000);
}, []);

// ✅ 好的模式 - 有 cleanup
useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
}, []);
```

## 输出格式

```markdown
# 性能分析报告 - [组件/文件名]

## 📊 问题概览
| 类型 | 数量 |
|------|------|
| 渲染问题 | ? |
| 内存问题 | ? |
| 网络问题 | ? |

## 🔴 严重问题
（可能导致明显卡顿或内存泄漏）

## 🟡 优化建议
（可以提升性能但非必须）

## 📝 具体修复代码
...
```

## 注意事项
- 提供具体的代码修复
- 说明优化的预期效果
- 使用中文输出
