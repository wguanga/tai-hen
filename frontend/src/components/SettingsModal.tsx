import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AppConfig } from '../types';
import { useToast } from './Toast';

type PresetId =
  | 'openai'
  | 'anthropic'
  | 'zhipu'
  | 'siliconflow'
  | 'deepseek'
  | 'ollama'
  | 'custom';

interface Preset {
  id: PresetId;
  label: string;
  provider: AppConfig['provider'];
  baseUrl: string;
  models: string[];
  keyUrl?: string;
  note?: string;
}

const PRESETS: Preset[] = [
  {
    id: 'zhipu',
    label: '智谱 AI（免费 glm-4-flash）',
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    models: [
      'glm-4-flash',
      'glm-4-flashx',
      'glm-4-air',
      'glm-4-plus',
      'glm-4v-flash',
      'glm-4v-plus',
    ],
    keyUrl: 'https://open.bigmodel.cn/',
    note: 'glm-4-flash 无限免费；glm-4v-* 支持图像',
  },
  {
    id: 'siliconflow',
    label: '硅基流动（部分免费）',
    provider: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'Qwen/Qwen2.5-7B-Instruct',
      'Qwen/Qwen2.5-Coder-7B-Instruct',
      'THUDM/glm-4-9b-chat',
      'internlm/internlm2_5-7b-chat',
      'deepseek-ai/DeepSeek-V2.5',
    ],
    keyUrl: 'https://cloud.siliconflow.cn/',
    note: '带"免费"标签的模型无限量',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek（便宜）',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    provider: 'anthropic',
    baseUrl: '',
    models: [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
    ],
    keyUrl: 'https://console.anthropic.com/',
  },
  {
    id: 'ollama',
    label: 'Ollama（本地，免费）',
    provider: 'ollama',
    baseUrl: '',
    models: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2', 'llava', 'mistral'],
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    provider: 'openai',
    baseUrl: '',
    models: [],
  },
];

const CUSTOM_MODEL = '__custom__';

function detectPreset(cfg: AppConfig): PresetId {
  if (cfg.provider === 'anthropic') return 'anthropic';
  if (cfg.provider === 'ollama') return 'ollama';
  const url = (cfg.base_url || '').toLowerCase();
  if (url.includes('bigmodel.cn')) return 'zhipu';
  if (url.includes('siliconflow')) return 'siliconflow';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (!url) return 'openai';
  return 'custom';
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState<AppConfig | null>(null);
  const [presetId, setPresetId] = useState<PresetId>('zhipu');
  const [model, setModel] = useState('glm-4-flash');
  const [customModel, setCustomModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    supports_vision: boolean;
    source: 'cache' | 'probe' | 'none';
    message: string;
  } | null>(null);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[PRESETS.length - 1];
  const modelOptions = dynamicModels ?? preset.models;
  const needsKey = preset.provider !== 'ollama';
  const isCustomModel = model === CUSTOM_MODEL || modelOptions.length === 0;
  const showBaseUrl = preset.provider === 'openai';

  useEffect(() => {
    setProbeResult(null);
  }, [model, customModel, presetId]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setLoaded(cfg);
        const pid = detectPreset(cfg);
        const p = PRESETS.find((x) => x.id === pid)!;
        setPresetId(pid);
        setBaseUrl(cfg.base_url || p.baseUrl);
        const savedModel = cfg.provider === 'ollama' ? cfg.ollama_model : cfg.model;
        if (p.models.includes(savedModel)) {
          setModel(savedModel);
        } else if (savedModel) {
          setModel(CUSTOM_MODEL);
          setCustomModel(savedModel);
        } else if (p.models.length > 0) {
          setModel(p.models[0]);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  function applyPreset(id: PresetId) {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setBaseUrl(p.baseUrl);
    setTestResult(null);
    setDynamicModels(null);
    setModelsError(null);
    setProbeResult(null);
    if (p.models.length > 0) {
      setModel(p.models[0]);
    } else {
      setModel(CUSTOM_MODEL);
      setCustomModel('');
    }
  }

  async function probeVision(force = false) {
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await api.probeVision(force);
      setProbeResult(res);
    } catch (e) {
      setProbeResult({
        supports_vision: false,
        source: 'none',
        message: '检测失败：' + (e as Error).message,
      });
    } finally {
      setProbing(false);
    }
  }

  async function refreshModels() {
    setFetchingModels(true);
    setModelsError(null);
    try {
      const res = await api.listModels({
        provider: preset.provider,
        base_url: baseUrl,
        api_key: apiKey || undefined,
      });
      if (res.models.length === 0) {
        setModelsError('该服务商未返回任何模型');
        return;
      }
      setDynamicModels(res.models);
      if (!res.models.includes(model) && model !== CUSTOM_MODEL) {
        setModel(res.models[0]);
      }
      toast(`拉取到 ${res.models.length} 个模型`, 'success');
    } catch (e) {
      setModelsError((e as Error).message);
    } finally {
      setFetchingModels(false);
    }
  }

  async function save() {
    const finalModel = (isCustomModel ? customModel : model).trim();
    if (!finalModel) {
      toast('请选择或填写模型名', 'error');
      return;
    }
    setSaving(true);
    setSaveNotice(null);
    try {
      const updated = await api.saveConfig({
        provider: preset.provider,
        model: preset.provider === 'ollama' ? (loaded?.model ?? '') : finalModel,
        base_url: baseUrl,
        ollama_model:
          preset.provider === 'ollama' ? finalModel : (loaded?.ollama_model ?? 'qwen2.5:14b'),
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setLoaded(updated);
      setApiKey('');
      setTestResult(null);
      setSaveNotice(
        updated.has_api_key
          ? `✓ 已保存（API Key: ${updated.api_key_preview}）`
          : '✓ 已保存',
      );
      toast('配置已保存', 'success');
    } catch (e) {
      toast('保存失败：' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function testConn() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConfig();
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-96 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-medium mb-3">设置</div>
        {loaded && (() => {
          // Prefer fresh probe result; fallback to loaded config's cached/heuristic value
          const hasFresh = !!probeResult;
          const supportsVision = hasFresh ? probeResult!.supports_vision : loaded.supports_vision;
          const source = hasFresh ? probeResult!.source : loaded.vision_source;
          const isCached = source === 'cache' || source === 'probe';
          const label = hasFresh
            ? probeResult!.message
            : isCached
              ? (supportsVision ? '✓ 已实测支持（缓存）' : '✗ 已实测不支持（缓存）')
              : (supportsVision ? '? 按模型名推测支持' : '? 按模型名推测不支持');
          const color = !isCached
            ? 'text-gray-500'
            : supportsVision ? 'text-green-600' : 'text-orange-500';
          return (
            <div className="text-xs mb-3 px-2 py-1 rounded bg-gray-50 dark:bg-gray-700 flex items-center gap-2">
              <span>视觉能力：</span>
              <span className={color}>{label}</span>
              <button
                type="button"
                onClick={() => probeVision(isCached)}
                disabled={probing}
                title={
                  isCached
                    ? '已缓存。点击强制重新检测（会消耗 1 次请求）'
                    : '向当前模型发送 1×1 测试图像，实际验证是否支持'
                }
                className="ml-auto text-indigo-500 hover:underline disabled:opacity-50"
              >
                {probing ? '检测中…' : isCached ? '🔄 强制重测' : '🔍 实测'}
              </button>
            </div>
          );
        })()}

        <label className="block text-xs text-gray-600 mb-1">服务商</label>
        <select
          value={presetId}
          onChange={(e) => applyPreset(e.target.value as PresetId)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-600">
            Model
            {dynamicModels && (
              <span className="text-green-600 ml-1">(已拉取 {dynamicModels.length} 个)</span>
            )}
          </label>
          <button
            type="button"
            onClick={refreshModels}
            disabled={fetchingModels}
            title="调用服务商 /v1/models 接口实时拉取"
            className="text-xs text-indigo-500 hover:underline disabled:opacity-50"
          >
            {fetchingModels ? '拉取中…' : '🔄 拉取可用模型'}
          </button>
        </div>
        {modelOptions.length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-2"
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value={CUSTOM_MODEL}>自定义…</option>
          </select>
        )}
        {isCustomModel && (
          <input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="输入模型 ID"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-2"
          />
        )}
        {modelsError && (
          <div className="text-xs text-red-500 mb-2">{modelsError}</div>
        )}
        {preset.note && !dynamicModels && (
          <div className="text-xs text-gray-500 mb-3">{preset.note}</div>
        )}

        {needsKey && (
          <>
            <label className="block text-xs text-gray-600 mb-1">
              API Key
              {loaded?.has_api_key && (
                <span className="text-green-600 ml-1">
                  ✓ 已保存：{loaded.api_key_preview || '••••'}
                </span>
              )}
              {preset.keyUrl && (
                <a
                  href={preset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-indigo-500 hover:underline"
                >
                  获取 →
                </a>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={loaded?.has_api_key ? '留空 = 继续用已保存的 key' : 'sk-...'}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
            />
          </>
        )}

        {showBaseUrl && (
          <>
            <label className="block text-xs text-gray-600 mb-1">
              Base URL {presetId !== 'custom' && <span className="text-gray-400">(可改)</span>}
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
            />
          </>
        )}

        {preset.provider === 'ollama' && (
          <div className="text-xs text-gray-500 mb-3">
            连接本地 http://localhost:11434，无需 API Key。
          </div>
        )}

        {saveNotice && (
          <div className="text-xs text-green-600 mb-2">{saveNotice}</div>
        )}

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={testConn}
            disabled={testing}
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
          >
            {testing ? '测试中…' : '🔌 测试连接'}
          </button>
          {testResult && (
            <span className={'text-xs ml-2 ' + (testResult.ok ? 'text-green-600' : 'text-red-500')}>
              {testResult.message}
            </span>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
            >
              {saveNotice ? '完成' : '取消'}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-sm px-3 py-1 rounded bg-indigo-500 text-white disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
