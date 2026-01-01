import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Send, Trash2, CheckCircle2, XCircle } from 'lucide-react';

// Common IPC channels for testing
const IPC_CHANNELS = [
  'github:pr:list',
  'github:pr:create',
  'github:issue:list',
  'github:issue:create',
  'github:worktree:list',
  'github:worktree:create',
  'settings:get',
  'settings:update',
  'project:get-env',
];

interface IPCResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export function IPCTester() {
  const { t } = useTranslation(['debug']);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [params, setParams] = useState('{}');
  const [response, setResponse] = useState<IPCResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!selectedChannel) {
      setResponse({
        success: false,
        error: 'Please select an IPC channel',
      });
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      // Parse parameters
      const parsedParams = JSON.parse(params);

      // Make real IPC call using testInvokeChannel
      const result = await window.electronAPI.testInvokeChannel(selectedChannel, parsedParams);

      setResponse({
        success: true,
        data: result,
      });
    } catch (error) {
      setResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setResponse(null);
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Input Section */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="ipc-channel" className="mb-2">
            {t('ipc.channelLabel')}
          </Label>
          <Select value={selectedChannel} onValueChange={setSelectedChannel}>
            <SelectTrigger id="ipc-channel">
              <SelectValue placeholder={t('ipc.channelPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {IPC_CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="ipc-params" className="mb-2">
            {t('ipc.paramsLabel')}
          </Label>
          <Textarea
            id="ipc-params"
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder={t('ipc.paramsPlaceholder')}
            className="font-mono min-h-[120px]"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSend} disabled={isLoading}>
            <Send className="mr-2 h-4 w-4" />
            {t('ipc.sendButton')}
          </Button>
          <Button variant="outline" onClick={handleClear}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('ipc.clearButton')}
          </Button>
        </div>
      </div>

      {/* Response Section */}
      <div className="flex-1 flex flex-col">
        <Label className="mb-2">{t('ipc.responseTitle')}</Label>
        <div className="flex-1 rounded-lg border bg-muted/50 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              {!response ? (
                <p className="text-sm text-muted-foreground">{t('ipc.noResponse')}</p>
              ) : (
                <div className="space-y-3">
                  <div className={`rounded-lg border p-4 ${response.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    <div className="flex items-center gap-2">
                      {response.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className={`font-semibold ${response.success ? 'text-green-500' : 'text-red-500'}`}>
                        {response.success ? t('ipc.success') : t('ipc.error')}
                      </span>
                    </div>
                    {response.error && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {response.error}
                      </p>
                    )}
                  </div>

                  {response.data && (
                    <div>
                      <pre className="text-sm font-mono bg-background rounded-lg p-4 overflow-x-auto">
                        {JSON.stringify(response.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
