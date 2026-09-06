-- F6-27 · Due ombrelloni nella stessa casella sarebbero una mappa che mente.
--
-- Il caso d'uso controlla già la casella di destinazione, ma il controllo da
-- solo non basta: uno spostamento è una scrittura come un'altra, e due tablet
-- possono farla nello stesso istante. La garanzia sta qui.
CREATE UNIQUE INDEX "umbrella_beach_club_id_beach_map_id_pos_x_pos_y_key"
  ON "umbrella"("beach_club_id", "beach_map_id", "pos_x", "pos_y");
