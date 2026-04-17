import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AppConfig } from '../types';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState<AppConfig['provider']>('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:14b');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.getConfig();
        setLoaded(cfg);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setBaseUrl(cfg.base_url);
        setOllamaModel(cfg.ollama_model);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.saveConfig({
        provider,
        model,
        base_url: baseUrl,
        ollama_model: ollamaModel,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      onClose();
    } catch (e) {
      alert('保存失败：' + (e as Error).message);
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
        {loaded && (
          <div className="text-xs mb-3 px-2 py-1 rounded bg-gray-50 dark:bg-gray-700">
            视觉能力：{loaded.supports_vision
              ? <span className="text-green-600">✓ 当前模型支持图像（可 AI 解读图表）</span>
              : <span className="text-orange-500">✗ 当前模型不支持图像 — 切至 gpt-4o / claude-3.x / llava 等</span>}
          </div>
        )}

        <label className="block text-xs text-gray-600 mb-1">Provider</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AppConfig['provider'])}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama (本地)</option>
        </select>

        {provider !== 'ollama' && (
          <>
            <label className="block text-xs text-gray-600 mb-1">
              Model
              <span className="text-gray-400">
                {provider === 'anthropic' ? ' (如 claude-sonnet-4-6)' : ' (如 gpt-4o-mini)'}
              </span>
            </label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
            />

            <label className="block text-xs text-gray-600 mb-1">
              API Key
              {loaded?.has_api_key && <span className="text-green-600 ml-1">(已配置)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={loaded?.has_api_key ? '留空不修改' : 'sk-...'}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
            />

            {provider === 'openai' && (
              <>
                <label className="block text-xs text-gray-600 mb-1">
                  Base URL <span className="text-gray-400">(可选，自定义网关)</span>
                </label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
                />
              </>
            )}
          </>
        )}

        {provider === 'ollama' && (
          <>
            <label className="block text-xs text-gray-600 mb-1">Ollama Model</label>
            <input
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-3"
            />
            <div className="text-xs text-gray-500 mb-3">
              连接本地 http://localhost:11434，无需 API Key。
            </div>
          </>
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
              取消
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
