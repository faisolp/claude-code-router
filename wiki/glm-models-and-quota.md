# GLM Models and Quota Guide

## Supported Models

### Main Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `glm-5.1` | รุ่นล่าสุดของ GLM | Default, Thinking, Long Context |
| `glm-5-turbo` | รุ่นเร็วของ GLM-5 | Background, Web Search |
| `glm-4` | รุ่นก่อนหน้า | General use |
| `glm-4-plus` | รุ่นเสริมความสามารถ | Enhanced performance |
| `glm-4-flash` | รุ่นเร็วสำหรับง่ายๆ | Quick tasks |
| `glm-4v` | Visual understanding model | Image analysis, Vision tasks |

### Anthropic-Compatible Models

ผ่าน GLM endpoint สามารถใช้ Claude model names ได้:

| Model | Description |
|-------|-------------|
| `claude-3-5-sonnet-20240620` | Claude 3.5 Sonnet (June 2024) |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet (October 2024) |

## Quota and Pricing

### Quota Consumption Rates

**Peak Hours:** 14:00–18:00 ทุกวัน (UTC+8)

| Model | Peak Hours | Off-Peak Hours |
|-------|-----------|----------------|
| GLM-5.1 | 3x | 1x (limited-time) |
| GLM-5-Turbo | 3x | 1x (limited-time) |
| GLM-4 series | Standard | Standard |
| Visual Understanding MCP | Standard (shared quota) | Standard (shared quota) |

**Limited-Time Benefit:** Off-peak usage (18:00–14:00 UTC+8) ถูกคิด 1x quota เท่านั้น จนถึง **end of June** 2026

### Peak Hours Conversion

**Thailand Time (UTC+7):**
- Peak: 13:00–17:00 น.
- Off-Peak: 17:01–12:59 น.

**China Time (UTC+8):**
- Peak: 14:00–18:00 น.
- Off-Peak: 18:01–13:59 น.

## Router Configuration Recommendations

### Optimize for Cost

```json
{
  "Router": {
    "default": "glm,glm-5.1",
    "background": "glm,glm-5-turbo",
    "think": "glm,glm-5.1",
    "longContext": "glm,glm-5.1",
    "webSearch": "glm,glm-5-turbo"
  }
}
```

**คำอธิบาย:**
- **default** (glm-5.1): เลือก model ที่ดีที่สุดสำหรับงานทั่วไป
- **background** (glm-5-turbo): ใช้ turbo สำหรับ background tasks เพื่อประหยัด quota
- **think** (glm-5.1): ใช้ model ที่แม่นยำที่สุดสำหรับ planning
- **longContext** (glm-5.1): ใช้ model ที่เก่งที่สุดสำหรับ long context
- **webSearch** (glm-5-turbo): ใช้ turbo เพื่อความเร็วใน web search

### Optimize for Performance

```json
{
  "Router": {
    "default": "glm,glm-5.1",
    "background": "glm,glm-4-flash",
    "think": "glm,glm-5.1",
    "longContext": "glm,glm-5.1",
    "webSearch": "glm,glm-4-flash"
  }
}
```

**คำอธิบาย:** ใช้ glm-4-flash สำหรับงานเบาๆ เพื่อประหยัด quota มากขึ้น

### Mixed Strategy (Recommended)

```json
{
  "Router": {
    "default": "glm,glm-5.1",
    "background": "glm,glm-4-flash",
    "think": "glm,glm-5.1",
    "longContext": "glm,glm-5.1",
    "webSearch": "glm,glm-4v",
    "image": "glm,glm-4v"
  }
}
```

**คำอธิบาย:**
- ใช้ glm-5.1 สำหรับงานสำคัญ (default, think, longContext)
- ใช้ glm-4-flash สำหรับ background tasks (ประหยัด quota)
- ใช้ glm-4v สำหรับ vision tasks (webSearch ที่มีรูป, image analysis)

## Cost Optimization Tips

### 1. Schedule Heavy Tasks During Off-Peak Hours

**Off-Peak Hours (UTC+8):** 18:01–13:59 น.

จัด schedule tasks หนักๆ ในช่วง off-peak:
- Batch processing
- Large document analysis
- Code refactoring
- Long conversations

### 2. Use Appropriate Models per Scenario

| Scenario | Recommended Model | Reason |
|----------|------------------|---------|
| Quick questions | glm-4-flash | ประหยัด quota, เร็ว |
| Background tasks | glm-4-flash | Low priority |
- Important work | glm-5.1 | คุณภาพสูงสุด |
| Planning/Thinking | glm-5.1 | แม่นยำ |
| Web search (text) | glm-5-turbo | สมดุลความเร็ว/คุณภาพ |
| Web search (images) | glm-4v | Visual understanding |

### 3. Monitor Quota Usage

```bash
# ดู logs เพื่อ check model usage
tail -f ~/.claude-code-router/logs/ccr-*.log | grep "model"
```

### 4. Use Model-Specific Routing

ถ้ามี custom routing logic:

```javascript
// custom-router.js
function customRouter(request) {
  const hour = new Date().getUTCHours() + 8; // UTC+8

  // Peak hours: ใช้ glm-4-flash ถ้าได้
  if (hour >= 14 && hour < 18) {
    if (request.scenario === 'background') {
      return 'glm,glm-4-flash';
    }
  }

  // Off-peak: ใช้ glm-5.1 เต็มที่
  return 'glm,glm-5.1';
}
```

## Model Comparison

### Performance vs Cost

| Model | Quality | Speed | Peak Quota | Off-Peak Quota | Best For |
|-------|---------|-------|------------|----------------|----------|
| glm-5.1 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 3x | 1x | Important work |
| glm-5-turbo | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 3x | 1x | Balanced performance |
| glm-4 | ⭐⭐⭐ | ⭐⭐⭐ | Standard | Standard | General use |
| glm-4-plus | ⭐⭐⭐⭐ | ⭐⭐⭐ | Standard | Standard | Enhanced tasks |
| glm-4-flash | ⭐⭐ | ⭐⭐⭐⭐⭐ | Standard | Standard | Quick tasks |
| glm-4v | ⭐⭐⭐⭐ | ⭐⭐⭐ | Standard (shared) | Standard (shared) | Vision tasks |

## Visual Understanding (MCP)

GLM-4V และ Visual Understanding MCP ใช้ quota ร่วมกัน:

**ข้อดี:**
- ใช้ quota เดียวกัน
- ไม่มีการคิดโทษเพิ่ม (3x, 2x)
- เหมาะกับ image analysis tasks

**ข้อควรระวัง:**
- Vision tasks มัก consume quota มากกว่า
- ตรวจสอบ quota balance บ่อยๆ

**ตัวอย่างการใช้งาน:**
```json
{
  "Router": {
    "image": "glm,glm-4v",
    "webSearch": "glm,glm-4v"
  }
}
```

## Examples

### Example 1: ทดสอบ GLM-5.1

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,glm-5.1",
    "messages": [{"role": "user", "content": "อธิบาย quantum computing"}],
    "max_tokens": 200
  }'
```

### Example 2: ทดสอบ GLM-5-Turbo (เร็วกว่า)

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,glm-5-turbo",
    "messages": [{"role": "user", "content": "สรุปข่าววันนี้"}],
    "max_tokens": 100
  }'
```

### Example 3: ทดสอบ GLM-4V (Vision)

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,glm-4v",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "อธิบายรูปนี้"},
        {"type": "image", "source": {"type": "url", "url": "https://example.com/image.jpg"}}
      ]
    }],
    "max_tokens": 200
  }'
```

## Monitoring and Analytics

### Check Quota Usage

จาก GLM/z.ai dashboard หรือ API:

```bash
# เช็ค quota balance (ถ้ามี API)
curl https://api.z.ai/quota \
  -H "Authorization: Bearer bf42a4cd3dfd445eba7f603c94a702f4.GV7ZzdQoqFK0FJ03"
```

### Log Analysis

```bash
# ดู model usage และ quota consumption
grep "model" ~/.claude-code-router/logs/ccr-*.log | awk '{print $7}' | sort | uniq -c
```

## Summary

**Key Points:**
1. **GLM-5.1** = คุณภาพสูงสุด, แพงที่สุดใน peak hours
2. **GLM-5-Turbo** = สมดุลระหว่างความเร็วและคุณภาพ
3. **GLM-4-Flash** = ประหยัด quota, เร็ว, เหมาะกับงานเบา
4. **GLM-4V** = Vision tasks, ใช้ quota ร่วมกับ MCP
5. **Off-Peak Benefit** = คิด 1x quota (limited-time until end of June)

**Best Practices:**
- ใช้ glm-4-flash สำหรับ background tasks
- ใช้ glm-5.1 สำหรับงานสำคัญ
- จัด schedule heavy tasks ใน off-peak hours
- Monitor quota usage สม่ำเสมอ

## อ้างอิง

- GLM Pricing: https://docs.z.ai/pricing
- GLM Models: https://docs.z.ai/models
- Visual Understanding MCP: https://docs.z.ai/mcp/vision
