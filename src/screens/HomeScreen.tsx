import "../styles/home.css";

interface HomeScreenProps {
  onSinglePlayer: () => void;
  onMultiplayerHost: () => void;
  onMultiplayerJoin: () => void;
}

export default function HomeScreen({
  onSinglePlayer,
  onMultiplayerHost,
  onMultiplayerJoin,
}: HomeScreenProps) {
  return (
    <div className="home-root">
      <div className="home-bg" />
      <div className="home-vignette" />

      <div className="home-content">
        <div className="home-brand">
          <img
            className="home-title-image"
            src="/assets/images/Monkopoly2.0_Image.png"
            alt="Monkopoly 2.0"
            draggable={false}
          />
        </div>
        <p className="home-subtitle">
          The jungle's favorite property game &mdash; play solo or with friends
        </p>

        <div className="home-buttons">
          <button className="home-btn home-btn-primary" onClick={onSinglePlayer}>
            Single Player
          </button>
          <button
            className="home-btn home-btn-secondary"
            onClick={onMultiplayerHost}
          >
            Host Multiplayer
          </button>
          <button
            className="home-btn home-btn-tertiary"
            onClick={onMultiplayerJoin}
          >
            Join with Code
          </button>
        </div>
      </div>

      <div className="home-footer">Up to 4 players</div>
    </div>
  );
}
