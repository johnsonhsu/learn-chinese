import { speak } from '../utils/speech';

interface Props {
  character: string;
}

export function AudioButton({ character }: Props) {
  return (
    <button className="audio-btn" onClick={() => speak(character)}>
      🔊 播放
    </button>
  );
}
