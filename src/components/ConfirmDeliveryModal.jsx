// src/components/ConfirmDeliveryModal.jsx
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { extractDigitsFromSpeech } from '../lib/extractDigitsFromSpeech';

async function callApi(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Erro na requisição');
  return json;
}

export default function ConfirmDeliveryModal({ order, onClose, onConfirmed }) {
  const [hasStoredCode, setHasStoredCode] = useState(false);
  const [checkingStoredCode, setCheckingStoredCode] = useState(true);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);

  const SpeechRecognitionApi =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  function handleMicClick() {
    if (!SpeechRecognitionApi) {
      setError('Reconhecimento de voz não é suportado neste navegador.');
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'pt-BR';
    // continuous + interimResults: deixa escutando por mais tempo e vai
    // capturando palavra por palavra, em vez de cortar no primeiro silêncio
    // curto (que é o comportamento padrão com continuous=false e pode
    // encerrar antes do entregador terminar de falar os 4 números).
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    setError('');
    setCode('');
    setListening(true);
    let capturedDigits = '';

    // timeout de segurança: se em 10s não capturou nada, para sozinho
    // (sem isso, "continuous: true" ficaria escutando pra sempre)
    const safetyTimeout = setTimeout(() => {
      console.log('[mic] timeout de 10s atingido, parando');
      recognition.stop();
    }, 10000);

    recognition.onstart = () => {
      console.log('[mic] reconhecimento iniciado, fale os números');
    };

    recognition.onresult = (event) => {
      // junta tudo que já foi reconhecido até agora (parcial + final)
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript + ' ';
      }
      console.log('[mic] transcrição parcial recebida:', fullTranscript);

      const digits = extractDigitsFromSpeech(fullTranscript);
      console.log('[mic] dígitos extraídos até agora:', digits);

      if (digits) {
        capturedDigits = digits;
        setCode(digits);
      }

      // assim que tiver 4 dígitos, não precisa mais escutar
      if (digits.length === 4) {
        clearTimeout(safetyTimeout);
        recognition.stop();
      }
    };

    recognition.onerror = (event) => {
      console.error('[mic] erro do reconhecimento de voz:', event.error);
      const messages = {
        'not-allowed': 'Permissão de microfone negada. Habilite o microfone para este site nas configurações do navegador.',
        'no-speech': 'Nenhuma fala detectada. Tente falar mais perto do microfone.',
        'audio-capture': 'Nenhum microfone encontrado neste dispositivo.',
        network: 'Erro de conexão durante o reconhecimento de voz. Tente novamente.'
      };
      setError(messages[event.error] || `Erro ao ouvir o áudio (${event.error}). Tente de novo ou digite o código.`);
    };

    recognition.onend = () => {
      console.log('[mic] reconhecimento encerrado, dígitos capturados:', capturedDigits);
      clearTimeout(safetyTimeout);
      setListening(false);
      if (!capturedDigits) {
        setError((prev) => prev || 'Não entendi nenhum número. Tente de novo ou digite o código.');
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('[mic] falha ao iniciar recognition.start()', err);
      setError('Não foi possível iniciar o microfone. Tente novamente.');
      setListening(false);
    }
  }

  useEffect(() => {
    callApi(`/api/ifood/order-meta?orderId=${order.id}`, { method: 'GET' })
      .then((res) => setHasStoredCode(res.hasStoredCode))
      .catch(() => setHasStoredCode(false))
      .finally(() => setCheckingStoredCode(false));
  }, [order.id]);

  async function handleConfirm({ useStoredCode }) {
    setLoading(true);
    setError('');
    try {
      const result = await callApi('/api/ifood/verify-delivery', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, code: useStoredCode ? undefined : code, useStoredCode })
      });

      if (!result.valid) {
        setError('Código incorreto. Peça o código novamente ao cliente.');
        setLoading(false);
        return;
      }

      onConfirmed();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Confirmar entrega</h2>
        <p className="mb-4 text-sm text-gray-500">Pedido de {order.customer_name}</p>

        {checkingStoredCode && <p className="text-sm text-gray-400">Verificando...</p>}

        {!checkingStoredCode && hasStoredCode && (
          <button
            onClick={() => handleConfirm({ useStoredCode: true })}
            disabled={loading}
            className="mb-3 w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? 'Confirmando...' : 'Confirmar entrega sem código'}
          </button>
        )}

        {!checkingStoredCode && hasStoredCode && (
          <p className="mb-3 text-center text-xs text-gray-400">ou digite um novo código abaixo</p>
        )}

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">Código de confirmação do cliente</label>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="0000"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-brand-500 focus:outline-none"
            />
            {SpeechRecognitionApi && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={listening}
                title="Falar o código"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition ${
                  listening
                    ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
              </button>
            )}
          </div>
          {listening && <p className="mt-1 text-center text-xs text-red-500">Ouvindo... diga os 4 números</p>}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleConfirm({ useStoredCode: false })}
            disabled={loading || !code}
            className="flex-1 rounded-lg bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
