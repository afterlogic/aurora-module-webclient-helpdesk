<?php
/**
 * This code is licensed under AfterLogic Software License.
 * For full statements of the license see LICENSE file.
 */

namespace Aurora\Modules\HelpDeskWebclient;

/**
 * @license https://afterlogic.com/products/common-licensing AfterLogic Software License
 * @copyright Copyright (c) 2019, Afterlogic Corp.
 *
 * @package Modules
 */
class Module extends \Aurora\System\Module\AbstractWebclientModule
{
	public $oApiHelpDeskManager = null;
	
	public $oCoreDecorator = null;
	
	public function init() 
	{
//		$this->oApiHelpDeskManager = $this->GetManager('main');

		$this->AddEntry('helpdesk', 'EntryHelpDesk');
		
		$this->oCoreDecorator = \Aurora\Modules\Core\Module::Decorator();
		$this->oHelpDeskDecorator = \Aurora\Modules\HelpDesk\Module::Decorator();
		
		$this->subscribeEvent('System::DetectTenant', array($this, 'onTenantDetect'));
	}
	
	public function EntryHelpDesk()
	{
		$oAuthenticatedAccount = $this->oHelpDeskDecorator->GetCurrentUser();

		$oApiIntegrator = \Aurora\System\Managers\Integrator::getInstance();
		
//		$mHelpdeskLogin = $this->oHttp->GetQuery('helpdesk');
		$sTenantName = \Aurora\System\Api::getTenantName();
		$mHelpdeskIdTenant = $this->oCoreDecorator->GetTenantIdByName($sTenantName);
		
		if (!\is_int($mHelpdeskIdTenant))
		{
			\Aurora\System\Api::Location('./');
			return '';
		}

		$bDoId = false;
		$sThread = $this->oHttp->GetQuery('thread');
		$sThreadAction = $this->oHttp->GetQuery('action');
		if (0 < \strlen($sThread))
		{
			$iThreadID = $this->oApiHelpDeskManager->getThreadIdByHash($mHelpdeskIdTenant, $sThread);
			if (0 < $iThreadID)
			{
				$oApiIntegrator->setThreadIdFromRequest($iThreadID, $sThreadAction);
				$bDoId = true;
			}
		}

		$sActivateHash = $this->oHttp->GetQuery('activate');
		if (0 < \strlen($sActivateHash) && !$this->oHttp->HasQuery('forgot'))
		{
			$bRemove = true;
			$oUser = $this->oApiHelpDeskManager->getUserByActivateHash($mHelpdeskIdTenant, $sActivateHash);
			/* @var $oUser \CHelpdeskUser */
			if ($oUser)
			{
				if (!$oUser->Activated)
				{
					$oUser->Activated = true;
					$oUser->regenerateActivateHash();

					if ($this->oApiHelpDeskManager->updateUser($oUser))
					{
						$bRemove = false;
						$oApiIntegrator->setUserAsActivated($oUser);
					}
				}
			}

			if ($bRemove)
			{
				$oApiIntegrator->removeUserAsActivated();
			}
		}

		if ($oAuthenticatedAccount && $oAuthenticatedAccount->IdTenant === $mHelpdeskIdTenant)
		{
			if (!$bDoId)
			{
				$oApiIntegrator->setThreadIdFromRequest(0);
			}

			$oApiIntegrator->skipMobileCheck();
			\Aurora\System\Api::Location('./');
			return '';
		}
		
		$oCoreClientModule = \Aurora\System\Api::GetModule('CoreWebclient');
		if ($oCoreClientModule instanceof \Aurora\System\Module\AbstractModule) {
			$sResult = \file_get_contents($oCoreClientModule->GetPath().'/templates/Index.html');
		}
		
		if (\is_string($sResult))
		{
			$oSettings =& \Aurora\System\Api::GetSettings();
			$sFrameOptions = $oSettings->GetValue('XFrameOptions', '');
			if (0 < \strlen($sFrameOptions)) {
				@\header('X-Frame-Options: '.$sFrameOptions);
			}
			
//			$sHelpdeskHash = $this->oHttp->GetQuery('helpdesk', '');

			$sResult = \strtr($sResult, array(
				'{{AppVersion}}' => AU_APP_VERSION,
				'{{IntegratorDir}}' =>  $oApiIntegrator->isRtl() ? 'rtl' : 'ltr',
				'{{IntegratorLinks}}' => $oApiIntegrator->buildHeadersLink('-helpdesk'),
				'{{IntegratorBody}}' => $oApiIntegrator->buildBody('-helpdesk')
			));
		}
		
		return $sResult;
	}
	
	public function onTenantDetect($oParams, &$mResult)
	{
		if ($oParams && $oParams['URL'])
		{
			$aUrlData = \Sabre\Uri\parse($oParams['URL']);
			
			if ($aUrlData['query'])
			{
				$aParameters = \explode('&', $aUrlData['query']);
				
				if (!\is_array($aParameters))
				{
					$aParameters = array($aParameters);
				}
				
				$aParametersTemp = $aParameters;
				$aParameters = array();
				
				foreach ($aParametersTemp as &$aParameter) {
					$aParameterData = \explode('=', $aParameter);
					if (\is_array($aParameterData))
					{
						$aParameters[$aParameterData[0]] = $aParameterData[1];
					}
				}

				if (isset($aParameters['helpdesk']) && $this->oCoreDecorator->GetTenantIdByName($aParameters['helpdesk']))
				{
					$mResult = $aParameters['helpdesk'];
				}
			}
		}
	}
}
