{ pkgs, stdenv, ... }:
let
  gitignoreSrc = pkgs.fetchFromGitHub {
    owner = "hercules-ci";
    repo = "gitignore";
    # put the latest commit sha of gitignore Nix library here:
    rev = "2ced4519f865341adcb143c5d668f955a2cb997f";
    # use what nix suggests in the mismatch message here:
    sha256 = "sha256:0fc5bgv9syfcblp23y05kkfnpgh3gssz6vn24frs8dzw39algk2z";
  };
  inherit (import gitignoreSrc { inherit (pkgs) lib; }) gitignoreSource;
in
stdenv.mkDerivation rec {
  name = "video-recorder";

  buildInputs = [ pkgs.nodePackages.typescript ];

  src = gitignoreSource ./.;

  buildPhase = ''
    tsc
  '';

  installPhase = ''
    mkdir -p $out
    cp index.html $out/
    cp style.css $out/
    cp main.js $out/main-recache.js
    cp bootstrap.min.css $out/
  '';
}
