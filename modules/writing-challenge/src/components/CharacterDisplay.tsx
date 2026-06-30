import { getZhuyin } from '../utils/zhuyin';

interface Props {
  character: string;
  showCharacter: boolean;
}

export function CharacterDisplay({ character, showCharacter }: Props) {
  const zhuyin = getZhuyin(character);

  return (
    <div className="character-display">
      <div className="zhuyin">{zhuyin || '—'}</div>
      <div className="character">{showCharacter ? character : '\u00A0'}</div>
    </div>
  );
}
