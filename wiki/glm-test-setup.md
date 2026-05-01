# GLM Test Configuration Setup

## Quick Start

### 1. Copy Config ไปยัง CCR Config

```bash
# Backup config เดิม (ถ้ามี)
cp ~/.claude-code-router/config.json ~/.claude-code-router/config.json.backup

# สร้าง config ใหม่
mkdir -p ~/.claude-code-router
cp wiki/glm-test-config.json ~/.claude-code-router/config.json
```

หรือแก้ไขโดยตรง:
```bash
# เปิด config ด้วย text editor
nano ~/.claude-code-router/config.json
# หรือ
code ~/.claude-code-router/config.json
```

### 2. Restart CCR Service

```bash
ccr restart
```

### 3. Test Request

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,claude-3-5-sonnet-20240620",
    "messages": [{"role": "user", "content": "สวัสดี คุณเป็นใคร?"}],
    "max_tokens": 100
  }'
```

## Configuration Details

### จาก Environment Variables

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "bf42a4cd3dfd445eba7f603c94a702f4.GV7ZzdQoqFK0FJ03",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

### แปลงเป็น CCR Config

| Env Variable | CCR Config Field |
|--------------|-----------------|
| `ANTHROPIC_AUTH_TOKEN` | `Providers[0].api_key` |
| `ANTHROPIC_BASE_URL` | `Providers[0].api_base_url` |
| `API_TIMEOUT_MS` | `API_TIMEOUT_MS` (root level) |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | N/A (ไม่ใช้ใน CCR) |

### Provider Config

```json
{
  "Providers": [
    {
      "name": "glm",
      "api_base_url": "https://api.z.ai/api/anthropic",
      "api_key": "bf42a4cd3dfd445eba7f603c94a702f4.GV7ZzdQoqFK0FJ03",
      "models": [
        "glm-4",
        "glm-4-plus",
        "glm-4-flash",
        "claude-3-5-sonnet-20240620",
        "claude-3-5-sonnet-20241022"
      ],
      "transformer": {
        "use": ["Anthropic"]
      }
    }
  ]
}
```

**คำอธิบาย:**
- `name`: `"glm"` - ชื่อ provider สำหรับ internal use
- `api_base_url`: `https://api.z.ai/api/anthropic` - GLM API endpoint (จาก env)
- `api_key`: Token จาก `ANTHROPIC_AUTH_TOKEN`
- `models`: รายชื่อ models ที่รองรับ (GLM + Anthropic-compatible models)
- `transformer.use`: `["Anthropic"]` - ใช้ transformer เดียว -> bypass mode

## Router Configuration

```json
{
  "Router": {
    "default": "glm,claude-3-5-sonnet-20240620",
    "background": "glm,claude-3-5-sonnet-20240620",
    "think": "glm,claude-3-5-sonnet-20240620",
    "longContext": "glm,claude-3-5-sonnet-20240620",
    "webSearch": "glm,claude-3-5-sonnet-20240620"
  }
}
```

**Router Scenarios:**
- `default`: Model หลักสำหรับการใช้งานทั่วไป
- `background`: Model สำหรับ background tasks
- `think`: Model สำหรับ Plan Mode (thinking-intensive)
- `longContext`: Model สำหรับ long context tasks
- `webSearch`: Model สำหรับ web search tasks

## Model Selection

### GLM Models

| Model | Description | Peak Hours Quota |
|-------|-------------|------------------|
| `glm-5.1` | รุ่นล่าสุด คุณภาพสูงสุด | 3x |
| `glm-5-turbo` | รุ่นเร็วของ GLM-5 | 3x |
| `glm-4` | รุ่นหลักของ GLM | Standard |
| `glm-4-plus` | รุ่นเสริมความสามารถ | Standard |
| `glm-4-flash` | รุ่นเร็วสำหรับงานง่ายๆ | Standard |
| `glm-4v` | Visual understanding model | Standard (shared MCP) |

**Peak Hours:** 14:00–18:00 น. (UTC+8)
**Off-Peak Benefit:** คิด 1x quota จนถึง end of June 2026

ดูรายละเอียดเพิ่มเติมที่ [GLM Models and Quota Guide](glm-models-and-quota.md)

### Anthropic-Compatible Models (ผ่าน GLM)

| Model | Description |
|-------|-------------|
| `claude-3-5-sonnet-20240620` | Claude 3.5 Sonnet (June 2024) |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet (October 2024) |

**หมายเหตุ:** GLM (z.ai) รองรับ Anthropic API format ดังนั้นจึงสามารถใช้ Claude model names ผ่าน GLM endpoint ได้

## Testing

### Test 1: Simple Request

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,claude-3-5-sonnet-20240620",
    "messages": [{"role": "user", "content": "Hello GLM!"}],
    "max_tokens": 50
  }'
```

### Test 2: Multi-Turn Conversation

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{
    "model": "glm,claude-3-5-sonnet-20240620",
    "messages": [
      {"role": "user", "content": "ชื่ออะไร?"},
      {"role": "assistant", "content": "ฉันชื่อ GLM AI assistant"},
      {"role": "user", "content": "ทำอะไรได้บ้าง?"}
    ],
    "max_tokens": 100
  }'
```

### Test 3: ตรวจสอบ Bypass Mode

ดู logs:

```bash
tail -f ~/.claude-code-router/logs/ccr-*.log
```

**คาดหวัง:** ควรเห็นข้อความ:
```
Bypass enabled for provider glm with transformer Anthropic
```

### Test 4: ตรวจสอสถานะ Service

```bash
ccr status
```

## ข้อควรระวัง

### 1. API Key Security

**⚠️ สำคัญ:** Config ที่สร้างมาใช้ API key จริง อย่า commit ลง git หรือแชร์สาธารณะ

แนะนำให้:
- ใช้ API key จาก environment variable แทน hardcoded:
  ```bash
  export GLM_API_KEY="your-api-key"
  ```
- หรือใช้ interpolation ใน config:
  ```json
  {
    "api_key": "$GLM_API_KEY"
  }
  ```

### 2. Base URL Verification

ตรวจสอบว่า `https://api.z.ai/api/anthropic` เป็น endpoint ที่ถูกต้อง:
- อ่านจาก GLM/z.ai docs
- ลอง curl โดยตรง:
  ```bash
  curl https://api.z.ai/api/anthropic/v1/messages \
    -H "x-api-key: bf42a4cd3dfd445eba7f603c94a702f4.GV7ZzdQoqFK0FJ03" \
    -H "Content-Type: application/json" \
    -d '{"model": "claude-3-5-sonnet-20240620", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 10}'
  ```

### 3. Timeout Setting

จาก env: `API_TIMEOUT_MS: "3000000"` (50 นาที)

ใน CCR config:
```json
{
  "API_TIMEOUT_MS": 3000000
}
```

**หมายเหตุ:** Timeout ที่สูงมากอาจไม่เหมาะกับทุก use case พิจารณาปรับ:
- Production: `60000` (1 นาที)
- Development: `120000` (2 นาที)
- Long tasks: `300000` (5 นาที)

## Troubleshooting

### Problem: Authentication Error

**Error:** `401 Unauthorized` หรือ `Invalid API key`

**Solution:**
1. ตรวจสอบ API key ถูกต้องหรือไม่
2. ลอง request โดยตรงไปที่ z.ai API
3. ตรวจสอบว่าใช้ Bearer token หรือ x-api-key (จาก code เราใช้ Bearer สำหรับ GLM)

### Problem: Bypass Mode ไม่ทำงาน

**Symptom:** Logs ไม่แสดง "Bypass enabled"

**Solution:**
ตรวจสอบว่ามี transformer เดียวเท่านั้น:
```json
{
  "transformer": {
    "use": ["Anthropic"]  // เฉพาะตัวเดียว
  }
}
```

ถ้ามี 2 ขึ้นไป bypass mode จะไม่ทำงาน

### Problem: Model Not Found

**Error:** `400 Model not found`

**Solution:**
1. ตรวจสอบรายชื่อ models ที่รองรับจาก z.ai docs
2. ลองใช้ model name อื่น (เช่น `glm-4`)
3. ตรวจสอบ format: `provider,model` (เช่น `glm,claude-3-5-sonnet-20240620`)

### Problem: Connection Refused

**Error:** `ECONNREFUSED` หรือ timeout

**Solution:**
1. ตรวจสอบ base URL ถูกต้องหรือไม่
2. ตรวจสอบ internet connection
3. ตรวจสอบ firewall/proxy settings
4. ลอง ping หรือ curl ไปที่ endpoint

## ถอดการติดตั้ง (Rollback)

ถ้าต้องการ revert กลับไปใช้ config เดิม:

```bash
# Restore from backup
cp ~/.claude-code-router/config.json.backup ~/.claude-code-router/config.json

# Restart service
ccr restart
```

## อ้างอิง

- GLM Provider Wiki: `wiki/glm-provider.md`
- Plan Document: `~/.claude/plans/robust-baking-moon.md`
- GLM/z.ai API: https://docs.z.ai/devpack/tool/claude
