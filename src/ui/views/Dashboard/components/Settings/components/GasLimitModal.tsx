import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRabbyDispatch, useRabbySelector } from '@/ui/store';
import { PageHeader } from 'ui/component';
import { selectGasLimitMultiplier } from '@/ui/state/preference';
import {
  DEFAULT_GAS_LIMIT_MULTIPLIER,
  GAS_LIMIT_MULTIPLIER_PRESETS,
  MAX_GAS_LIMIT_MULTIPLIER,
  MIN_GAS_LIMIT_MULTIPLIER,
  normalizeGasLimitMultiplier,
} from '@/constant/redbelly';

import IconCheck from 'ui/assets/check-2.svg';

const formatMultiplier = (value: number) => `${value}x`;

export default function GasLimitModal({
  visible,
  onFinish,
  onCancel,
}: {
  visible: boolean;
  onFinish(): void;
  onCancel(): void;
}) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [custom, setCustom] = useState('');

  const multiplier = useRabbySelector((state) =>
    selectGasLimitMultiplier(state.preference)
  );
  const dispatch = useRabbyDispatch();

  const customNumber = parseFloat(custom);
  const isCustomValid =
    Number.isFinite(customNumber) &&
    customNumber >= MIN_GAS_LIMIT_MULTIPLIER &&
    customNumber <= MAX_GAS_LIMIT_MULTIPLIER;
  const isPreset = GAS_LIMIT_MULTIPLIER_PRESETS.includes(multiplier);

  const close = (callback: () => void) => {
    setIsVisible(false);
    setTimeout(callback, 500);
  };

  const handleSelect = (value: number) => {
    dispatch.preference.setGasLimitMultiplier(value);
    close(onFinish);
  };

  useEffect(() => {
    setTimeout(() => {
      setIsVisible(visible);
    }, 100);
    if (visible) {
      setCustom(isPreset ? '' : String(multiplier));
    }
    // Only re-seed the field when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <div
      className={clsx('switch-theme-modal', {
        show: isVisible,
        hidden: !visible,
      })}
    >
      <PageHeader forceShowBack onBack={() => close(onCancel)}>
        {t('page.dashboard.settings.settings.gasLimitMultiplier')}
      </PageHeader>
      <div className="switch-theme-option-list">
        <p className="gas-limit-desc">
          {t('page.dashboard.settings.settings.gasLimitMultiplierDesc')}
        </p>
        {GAS_LIMIT_MULTIPLIER_PRESETS.map((value) => (
          <div
            className="switch-theme-option-list-item"
            key={value}
            onClick={() => handleSelect(value)}
          >
            {formatMultiplier(value)}
            {value === DEFAULT_GAS_LIMIT_MULTIPLIER &&
              ` (${t('page.dashboard.settings.settings.gasLimitDefault')})`}
            {multiplier === value && (
              <img
                src={IconCheck}
                alt=""
                className="switch-theme-option-list-item-icon"
              />
            )}
          </div>
        ))}
        <div className="gas-limit-advanced">
          <div className="gas-limit-advanced-title">
            {t('page.dashboard.settings.settings.gasLimitAdvanced')}
            {!isPreset && (
              <img
                src={IconCheck}
                alt=""
                className="switch-theme-option-list-item-icon"
              />
            )}
          </div>
          <div className="gas-limit-advanced-row">
            <input
              className="gas-limit-input"
              inputMode="decimal"
              placeholder={`${MIN_GAS_LIMIT_MULTIPLIER} - ${MAX_GAS_LIMIT_MULTIPLIER}`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
            <button
              type="button"
              className="gas-limit-apply"
              disabled={!isCustomValid}
              onClick={() =>
                handleSelect(normalizeGasLimitMultiplier(customNumber))
              }
            >
              {t('page.dashboard.settings.settings.gasLimitApply')}
            </button>
          </div>
          {custom !== '' && !isCustomValid && (
            <div className="gas-limit-error">
              {t('page.dashboard.settings.settings.gasLimitInvalid', {
                min: MIN_GAS_LIMIT_MULTIPLIER,
                max: MAX_GAS_LIMIT_MULTIPLIER,
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
