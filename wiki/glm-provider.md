# GLM Provider Configuration

GLM API (จาก z.ai) ใช้รูปแบบเหมือนกับ Anthropic API ทั้งหมด (ตามเอกสาร: https://docs.z.ai/devpack/tool/claude)

## ข้อดีของการใช้ GLM กับ CCR

- **Bypass Transformation**: เนื่องจาก GLM ใช้ format เหมือน Anthropic ทั้งหมด จึงไม่ต้องทำการ transform request/response ทำให้ได้ประสิทธิภาพสูงสุด
- **Auto Bypass Mode**: เมื่อ config ให้ใช้ Anthropic transformer เพียงตัวเดียว ระบบจะเข้าสู่ bypass mode อัตโนมัติ
- **Direct Integration**: ส่ง request โดยตรงไปยัง GLM API โดยไม่ผ่าน transformation layer

## Configuration Example

เพิ่ม GLM provider ลงใน `~/.claude-code-router/config.json`:

```json
{
  "Providers": [
    {
      "name": "glm",
      "api_base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      "api_key": "your-glm-api-key-here",
      "models": ["glm-4", "glm-4-plus", "glm-4-flash"],
      "transformer": {
        "use": [
          "Anthropic"
        ]
      }
    }
  ],
  "Router": {
    "default": "glm,gm-4",
    "background": "glm,gm-4-flash"
  }
}
```

## Configuration Details

| Field | Description |
|-------|-------------|
| `name` | ชื่อ provider (ใช้ `glm` เพื่อให้ระบบรู้จัก) |
| `api_base_url` | GLM API endpoint (ตรวจสอบจาก docs z.ai) |
| `api_key` | API key สำหรับ GLM |
| `models` | รายชื่อ models ที่รองรับ |
| `transformer.use` | ใช้เพียง `Anthropic` transformer ตัวเดียว -> bypass mode เปิดอัตโนมัติ |

## วิธีการทำงาน

### 1. Bypass Mode Detection

ระบบตรวจสอบว่า provider ใช้ transformer เดียวหรือไม่:

```typescript
// จาก routes.ts
function shouldBypassTransformers(provider, transformer, body) {
  return (
    provider.transformer?.use?.length === 1 &&
    provider.transformer.use[0].name === transformer.name
  );
}
```

### 2. GLM Authentication

GLM ใช้ Bearer token authentication ซึ่งระบบจัดการอัตโนมัติ:

```typescript
// จาก anthropic.transformer.ts
const isGLM = provider.name === 'glm' ||
              (provider.baseUrl && provider.baseUrl.includes('z.ai'));

if (this.useBearer || isGLM) {
  headers["authorization"] = `Bearer ${provider.apiKey}`;
}
```

### 3. Direct Request Forwarding

ใน bypass mode:
- Request ถูกส่งตรงไปยัง GLM API
- ไม่มีการ transform request/response
- เพียงแค่ authentication header เท่านั้นที่ถูกเพิ่ม

## Models

GLM รองรับ models ต่อไปนี้ (ตามเอกสาร z.ai):

### GLM-5 Series
- `glm-5.1` - รุ่นล่าสุด คุณภาพสูงสุด (คิด 3x quota ใน peak hours)
- `glm-5-turbo` - รุ่นเร็วของ GLM-5 (คิด 3x quota ใน peak hours)

### GLM-4 Series
- `glm-4` - รุ่นหลัก
- `glm-4-plus` - รุ่นเสริมความสามารถ
- `glm-4-flash` - รุ่นเร็วสำหรับงานง่ายๆ
- `glm-4v` - Visual understanding model (ใช้ quota ร่วมกับ MCP)

**หมายเหตุ:** ดูรายละเอียด quota และ pricing ได้ที่ [GLM Models and Quota Guide](glm-models-and-quota.md)

## Testing

ทดสอบ GLM provider:

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-ccr-api-key" \
  -d '{
    "model": "glm,gm-4",
    "messages": [{"role": "user", "content": "Hello GLM"}],
    "max_tokens": 100
  }'
```

ตรวจสอบ logs:

```bash
tail -f ~/.claude-code-router/logs/ccr-*.log
```

ควรเห็น:
```
Bypass enabled for provider glm with transformer Anthropic
```

## Performance

เนื่องจาก bypass mode:
- ไม่มี overhead จากการ transform
- Response time เร็วขึ้น
- In-memory usage น้อยลง

## Troubleshooting

### Bypass mode ไม่ทำงาน

ตรวจสอบว่า config มี transformer เพียงตัวเดียว:

```json
{
  "transformer": {
    "use": ["Anthropic"]  // เฉพาะตัวเดียวเท่านั้น
  }
}
```

ถ้ามี 2 transformers ขึ้นไป bypass mode จะไม่ทำงาน

### Authentication Error

ตรวจสอบ:
1. `api_key` ถูกต้องหรือไม่
2. GLM API ยังใช้ Bearer token อยู่หรือไม่ (ตรวจสอบจาก docs z.ai)
3. Base URL ถูกต้องหรือไม่

### Request Format Error

GLM ใช้ format เหมือน Anthropic ทั้งหมด ถ้าเกิด error แปลว่า:
1. GLM API เปลี่ยน format แล้ว
2. Base URL ผิด
3. ไม่ได้ใช้ Anthropic transformer

## อ้างอิง

- GLM API Docs: https://docs.z.ai/devpack/tool/claude
- Anthropic API Docs: https://docs.anthropic.com/
