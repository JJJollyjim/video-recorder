{ pkgs, stdenv, ... }:
stdenv.mkDerivation rec {
  name = "video-recorder";

  buildInputs = [ pkgs.nodePackages.typescript ];

  src = builtins.fetchGit ./.;

  buildPhase = ''
    tsc
  '';

  installPhase = ''
    mkdir -p $out
    cp index.html $out/
    cp style.css $out/
    cp main.js $out/
    cp bootstrap.min.css $out/
  '';
}
