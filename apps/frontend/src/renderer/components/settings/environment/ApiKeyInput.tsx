import { useState } from 'react';
import { Eye, EyeOff, Globe, FileCode } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { EnvValueSource } from '../../../../shared/types/settings';

interface ApiKeyInputProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  source?: EnvValueSource;
  isSecret?: boolean;
  disabled?: boolean;
  className?: string;
  /** Show "Using global" badge and allow override */
  showSourceBadge?: boolean;
  /** Callback when user wants to override global value */
  onOverride?: () => void;
  /** Callback when user wants to use global value */
  onUseGlobal?: () => void;
  /** Whether this field is currently overriding global */
  isOverriding?: boolean;
}

/**
 * Reusable API key input with visibility toggle and source indicator
 */
export function ApiKeyInput({
  id,
  label,
  description,
  value,
  onChange,
  placeholder,
  source = 'none',
  isSecret = true,
  disabled = false,
  className,
  showSourceBadge = false,
  onOverride,
  onUseGlobal,
  isOverriding = false
}: ApiKeyInputProps) {
  const [showValue, setShowValue] = useState(false);

  const hasValue = value && value.length > 0;
  const inputType = isSecret && !showValue ? 'password' : 'text';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {showSourceBadge && source !== 'none' && (
          <div className="flex items-center gap-2">
            {source === 'global' && !isOverriding ? (
              <>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  Using global
                </Badge>
                {onOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onOverride}
                  >
                    Override
                  </Button>
                )}
              </>
            ) : source === 'project' || isOverriding ? (
              <>
                <Badge variant="outline" className="gap-1 text-xs">
                  <FileCode className="h-3 w-3" />
                  Project override
                </Badge>
                {onUseGlobal && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onUseGlobal}
                  >
                    Use global
                  </Button>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div className="relative">
        <Input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || (showSourceBadge && source === 'global' && !isOverriding)}
          className={cn(
            'pr-10',
            isSecret && hasValue && !showValue && 'font-mono tracking-wider'
          )}
        />
        {isSecret && hasValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowValue(!showValue)}
            tabIndex={-1}
          >
            {showValue ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
