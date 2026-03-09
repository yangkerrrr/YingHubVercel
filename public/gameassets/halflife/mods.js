zipMods = [
	['halva_en.zip', 'Half-Life (214M)', 214283501, 21, 10485760],
	['opposing_force_en.zip', 'Opposing Force (221M)', 221191140, 22, 10485760]
];

pkgMods = [
];
var selectZip=document.getElementById('selectZip');
var iArgs=document.getElementById('iArgs');
selectZip.addEventListener('change', function(){
	if(selectZip.value=="halva_en.zip")
	{
		iArgs.value="-dev 1 -game valve";
	}
	else if(selectZip.value=="opposing_force_en.zip")
	{
		iArgs.value="-dev 1 -game gearbox";
	}
	else if(selectZip.value=="halva_rus.zip")
	{
		iArgs.value="-dev 1 -game valve";
	}
	else if(selectZip.value=="opposing_force_rus.zip")
	{
		iArgs.value="-dev 1 -game valve";
	}
});
